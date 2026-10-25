/**
 * Cleanzen — Official Web Application Logic
 * Location: Perth, Western Australia
 * Author: Cleanzen Engineering
 * Description: Interactive Instant Quote Estimator, Hybrid Scheduling, and EmailJS Lead Handler.
 */

'use strict';

/**
 * ============================================================================
 * Configuration & EmailJS Setup
 * ============================================================================
 * Replace the placeholder keys below with your EmailJS credentials:
 * 1. Copy `js/config.example.js` to `js/config.js`.
 * 2. Add your EmailJS Service ID, Template ID, and Public Key into `js/config.js`.
 * 3. `js/config.js` is excluded from git via `.gitignore` to keep credentials private.
 */
const EMAILJS_CONFIG = window.EMAILJS_CONFIG || {
  publicKey: 'YOUR_EMAILJS_PUBLIC_KEY',
  serviceId: 'YOUR_EMAILJS_SERVICE_ID',
  templateId: 'YOUR_EMAILJS_TEMPLATE_ID',
  recipientEmail: 'cleanzen.info@gmail.com',
  isDemoMode: true
};

/**
 * ============================================================================
 * Type Definitions (JSDoc)
 * ============================================================================
 * @typedef {Object} QuoteState
 * @property {number} bedrooms - Number of bedrooms (1 to 5)
 * @property {number} bathrooms - Number of bathrooms (1 to 4)
 * @property {'general' | 'deep' | 'vacate'} serviceType - Selected cleaning service
 * @property {'weekly' | 'fortnightly' | 'monthly' | 'one-off'} frequency - Service frequency
 * @property {Object.<string, boolean>} extras - Selected add-on services
 * @property {string} preferredTimeSlot - Selected time window
 */

/**
 * Global reactive quote state
 * @type {QuoteState}
 */
const quoteState = {
  bedrooms: 2,
  bathrooms: 2,
  serviceType: 'general',
  frequency: 'fortnightly',
  extras: {
    windows: false,
    oven: false,
    balcony: false,
    carpet: false
  },
  preferredTimeSlot: 'morning'
};

/**
 * Perth Market Base Pricing Matrix (AUD)
 */
const PRICING_RULES = {
  // Base rates mapped to bedroom counts
  baseRoomRates: {
    1: { min: 110, max: 130, hours: '2.0 – 2.5' },
    2: { min: 140, max: 170, hours: '2.5 – 3.5' },
    3: { min: 180, max: 220, hours: '3.5 – 4.5' },
    4: { min: 230, max: 280, hours: '4.5 – 5.5' },
    5: { min: 290, max: 350, hours: '5.5 – 7.0' }
  },
  // Additional cost per extra bathroom beyond 1
  bathroomExtra: 25,
  // Multipliers by cleaning depth
  serviceMultipliers: {
    general: 1.0,
    deep: 1.35,
    vacate: 1.60
  },
  // Recurring client discounts
  frequencyDiscounts: {
    'one-off': 0.0,
    'monthly': 0.05,
    'fortnightly': 0.10,
    'weekly': 0.15
  },
  // Extra service add-on prices in AUD
  extraAddons: {
    windows: 45,
    oven: 50,
    balcony: 35,
    carpet: 60
  }
};

/**
 * ============================================================================
 * DOM Initialization
 * ============================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof emailjs !== 'undefined' && EMAILJS_CONFIG.publicKey) {
    emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
  }
  initEstimatorInteractions();
  initBookingForm();
  initFaqAccordion();
  initMobileNavigation();
  setMinDateConstraint();
  recalculateQuote();
});

/**
 * Sets the minimum booking date to tomorrow
 */
function setMinDateConstraint() {
  const dateInput = document.getElementById('bookingDate');
  if (!dateInput) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const formattedDate = tomorrow.toISOString().split('T')[0];
  dateInput.min = formattedDate;
}

/**
 * ============================================================================
 * Instant Quote Estimator
 * ============================================================================
 */
function initEstimatorInteractions() {
  // Bedroom selectors
  const bedroomPills = document.querySelectorAll('[data-bedrooms]');
  bedroomPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      bedroomPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      quoteState.bedrooms = parseInt(pill.getAttribute('data-bedrooms'), 10);
      recalculateQuote();
    });
  });

  // Bathroom selectors
  const bathroomPills = document.querySelectorAll('[data-bathrooms]');
  bathroomPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      bathroomPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      quoteState.bathrooms = parseInt(pill.getAttribute('data-bathrooms'), 10);
      recalculateQuote();
    });
  });

  // Service Type radio cards
  const serviceCards = document.querySelectorAll('[data-service]');
  serviceCards.forEach((card) => {
    card.addEventListener('click', () => {
      serviceCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      quoteState.serviceType = card.getAttribute('data-service');
      recalculateQuote();
    });
  });

  // Frequency selectors
  const freqOptions = document.querySelectorAll('[data-frequency]');
  freqOptions.forEach((option) => {
    option.addEventListener('click', () => {
      freqOptions.forEach((o) => o.classList.remove('active'));
      option.classList.add('active');
      quoteState.frequency = option.getAttribute('data-frequency');
      recalculateQuote();
    });
  });

  // Extras toggles
  const extraToggles = document.querySelectorAll('[data-extra]');
  extraToggles.forEach((toggle) => {
    const checkbox = toggle.querySelector('input[type="checkbox"]');
    toggle.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      const extraKey = toggle.getAttribute('data-extra');
      quoteState.extras[extraKey] = checkbox.checked;
      toggle.classList.toggle('active', checkbox.checked);
      recalculateQuote();
    });
  });

  // "Lock In This Estimate" Button
  const lockInBtn = document.getElementById('lockInEstimateBtn');
  if (lockInBtn) {
    lockInBtn.addEventListener('click', transferEstimateToBooking);
  }
}

/**
 * Calculates price range and updates the Estimator UI
 */
function recalculateQuote() {
  const baseData = PRICING_RULES.baseRoomRates[quoteState.bedrooms] || PRICING_RULES.baseRoomRates[2];
  const serviceMultiplier = PRICING_RULES.serviceMultipliers[quoteState.serviceType] || 1.0;
  const discountRate = PRICING_RULES.frequencyDiscounts[quoteState.frequency] || 0.0;

  // Extra bathrooms calculation (beyond 1)
  const additionalBathrooms = Math.max(0, quoteState.bathrooms - 1);
  const bathroomSurcharge = additionalBathrooms * PRICING_RULES.bathroomExtra;

  // Sum active extras
  let extrasCost = 0;
  Object.keys(quoteState.extras).forEach((key) => {
    if (quoteState.extras[key]) {
      extrasCost += PRICING_RULES.extraAddons[key] || 0;
    }
  });

  // Calculate Subtotals
  let calculatedMin = (baseData.min + bathroomSurcharge) * serviceMultiplier + extrasCost;
  let calculatedMax = (baseData.max + bathroomSurcharge) * serviceMultiplier + extrasCost;

  // Apply frequency discount
  if (discountRate > 0) {
    calculatedMin *= (1 - discountRate);
    calculatedMax *= (1 - discountRate);
  }

  // Round to nearest $5 for clean presentation
  const finalMin = Math.round(calculatedMin / 5) * 5;
  const finalMax = Math.round(calculatedMax / 5) * 5;

  // Update DOM elements
  const priceDisplay = document.getElementById('estimatePriceRange');
  if (priceDisplay) {
    priceDisplay.textContent = `$${finalMin} – $${finalMax}`;
  }

  const hoursDisplay = document.getElementById('estimateHours');
  if (hoursDisplay) {
    hoursDisplay.textContent = `${baseData.hours} hours`;
  }

  const summaryService = document.getElementById('summaryServiceType');
  if (summaryService) {
    const serviceNames = {
      general: 'General Clean',
      deep: 'Deep Clean',
      vacate: 'Vacate / Bond Clean'
    };
    summaryService.textContent = serviceNames[quoteState.serviceType] || 'General Clean';
  }

  const summaryFrequency = document.getElementById('summaryFrequency');
  if (summaryFrequency) {
    const frequencyNames = {
      'one-off': 'One-off Clean',
      'monthly': 'Monthly Clean (-5%)',
      'fortnightly': 'Fortnightly Clean (-10%)',
      'weekly': 'Weekly Clean (-15%)'
    };
    summaryFrequency.textContent = frequencyNames[quoteState.frequency] || 'Fortnightly';
  }

  const summaryRooms = document.getElementById('summaryRooms');
  if (summaryRooms) {
    summaryRooms.textContent = `${quoteState.bedrooms} Bed, ${quoteState.bathrooms} Bath`;
  }

  // Update Booking Form Banner as well
  const formBannerPrice = document.getElementById('formBannerPrice');
  if (formBannerPrice) {
    formBannerPrice.textContent = `$${finalMin} – $${finalMax} AUD`;
  }

  const formBannerDetails = document.getElementById('formBannerDetails');
  if (formBannerDetails) {
    formBannerDetails.textContent = `${quoteState.bedrooms} Bed, ${quoteState.bathrooms} Bath • ${quoteState.serviceType.toUpperCase()} • ${quoteState.frequency.toUpperCase()}`;
  }
}

/**
 * Transfers current quote configuration into booking form and smoothly scrolls
 */
function transferEstimateToBooking() {
  const bookingSection = document.getElementById('booking');
  if (bookingSection) {
    bookingSection.scrollIntoView({ behavior: 'smooth' });
  }

  // Focus on the first input
  setTimeout(() => {
    const nameInput = document.getElementById('clientName');
    if (nameInput) nameInput.focus();
  }, 600);
}

/**
 * ============================================================================
 * Hybrid Booking Form & EmailJS Integration
 * ============================================================================
 */
function initBookingForm() {
  const bookingForm = document.getElementById('cleanzenBookingForm');
  if (!bookingForm) return;

  // Time Slot Selection (Morning / Afternoon / Flexible)
  const slotRadios = document.querySelectorAll('[data-slot]');
  slotRadios.forEach((radio) => {
    radio.addEventListener('click', () => {
      slotRadios.forEach((r) => r.classList.remove('active'));
      radio.classList.add('active');
      quoteState.preferredTimeSlot = radio.getAttribute('data-slot');
    });
  });

  // Submit Handler
  bookingForm.addEventListener('submit', handleBookingSubmit);
}

/**
 * Handles quote/booking submission via EmailJS
 * @param {Event} event 
 */
async function handleBookingSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const statusBox = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBookingBtn');

  // Collect form values
  const clientName = document.getElementById('clientName').value.trim();
  const clientPhone = document.getElementById('clientPhone').value.trim();
  const clientEmail = document.getElementById('clientEmail').value.trim();
  const clientSuburb = document.getElementById('clientSuburb').value.trim();
  const bookingDate = document.getElementById('bookingDate').value;
  const clientNotes = document.getElementById('clientNotes').value.trim();

  // Basic validation
  if (!clientName || !clientPhone || !clientEmail || !clientSuburb) {
    showStatusMessage('Please complete all required fields (Name, Phone, Email, Suburb).', 'error');
    return;
  }

  // Active extras list
  const activeExtras = Object.keys(quoteState.extras)
    .filter((k) => quoteState.extras[k])
    .join(', ') || 'None';

  const priceRange = document.getElementById('estimatePriceRange')?.textContent || 'Pending';

  // Construct Email payload
  const emailPayload = {
    to_email: EMAILJS_CONFIG.recipientEmail,
    client_name: clientName,
    client_phone: clientPhone,
    client_email: clientEmail,
    client_suburb: clientSuburb,
    service_type: quoteState.serviceType,
    bedrooms: quoteState.bedrooms,
    bathrooms: quoteState.bathrooms,
    frequency: quoteState.frequency,
    extras: activeExtras,
    preferred_date: bookingDate || 'Flexible / Next available',
    preferred_time_slot: quoteState.preferredTimeSlot,
    estimated_price: priceRange,
    notes: clientNotes || 'No special instructions provided'
  };

  // Button loading state
  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Sending Quote Request...';

  try {
    // Check if real EmailJS credentials have been supplied
    const isPlaceholder = EMAILJS_CONFIG.publicKey.includes('YOUR_') || EMAILJS_CONFIG.isDemoMode;

    if (!isPlaceholder && typeof emailjs !== 'undefined') {
      // Production live send with EmailJS v4 / v3 compatibility
      await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        emailPayload
      );
    } else {
      // Demo simulated sending mode for instant testing
      console.info('Cleanzen EmailJS Demo Mode payload:', emailPayload);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    showStatusMessage(
      `Thank you, ${clientName}! Your quote request for ${clientSuburb} has been sent. Natasha & Laura will contact you on ${clientPhone} within 2 hours to confirm your schedule.`,
      'success'
    );

    form.reset();
    setMinDateConstraint();
    recalculateQuote();

  } catch (error) {
    console.error('EmailJS Error:', error);
    showStatusMessage('An error occurred while sending your request. Please call Natasha & Laura directly on 0421 081 962.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Send Quote & Date Request';
  }
}

/**
 * Displays status messages below the form
 * @param {string} message 
 * @param {'success' | 'error'} type 
 */
function showStatusMessage(message, type) {
  const statusBox = document.getElementById('formStatus');
  if (!statusBox) return;

  statusBox.className = `form-status ${type}`;
  statusBox.textContent = message;
  statusBox.style.display = 'block';

  // Auto-scroll to status message
  statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * ============================================================================
 * FAQ Accordion
 * ============================================================================
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      faqItems.forEach((i) => i.classList.remove('open'));
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });
}

/**
 * ============================================================================
 * Mobile Navigation Toggle
 * ============================================================================
 */
function initMobileNavigation() {
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('mainNavLinks');

  if (!toggleBtn || !navLinks) return;

  toggleBtn.addEventListener('click', () => {
    const isVisible = navLinks.style.display === 'flex';
    navLinks.style.display = isVisible ? 'none' : 'flex';
    navLinks.style.flexDirection = 'column';
    navLinks.style.position = 'absolute';
    navLinks.style.top = '80px';
    navLinks.style.left = '0';
    navLinks.style.right = '0';
    navLinks.style.background = '#FFFFFF';
    navLinks.style.padding = '1.5rem';
    navLinks.style.boxShadow = '0 10px 25px rgba(30, 58, 95, 0.15)';
  });
}
