import {
  calculateBookingPrice,
  getSeatDetails,
  toggleSeatSelection,
  validateSelection,
} from "./seats.js";

const ROW_NAMES = ["A", "B", "C", "D", "E", "F"];
const FIRST_SEAT_NUMBER = 1;
const LAST_SEAT_NUMBER = 10;

const elements = {
  eventTitle: document.getElementById("event-title"),
  loadingState: document.getElementById("loading-state"),
  loadError: document.getElementById("load-error"),
  loadErrorMessage: document.getElementById("load-error-message"),
  retryButton: document.getElementById("retry-button"),
  seatMap: document.getElementById("seat-map"),
  categoryLegend: document.querySelector(".category-legend"),
  selectionErrors: document.getElementById("selection-errors"),
  selectedSeatList: document.getElementById("selected-seat-list"),
  totalPrice: document.getElementById("total-price"),
  continueButton: document.getElementById("continue-button"),
  checkoutDialog: document.getElementById("checkout-dialog"),
  checkoutForm: document.getElementById("checkout-form"),
  checkoutErrors: document.getElementById("checkout-errors"),
  customerName: document.getElementById("customer-name"),
  customerEmail: document.getElementById("customer-email"),
  cancelCheckoutButton: document.getElementById("cancel-checkout-button"),
  bookingAnnouncement: document.getElementById("booking-announcement"),
};

const requiredElements = Object.entries(elements).filter(([, element]) => !element);
if (requiredElements.length > 0) {
  throw new Error(`Missing required page elements: ${requiredElements.map(([name]) => name).join(", ")}.`);
}

let eventData = null;
let selectedSeatIds = [];
let loading = false;
let rovingSeatId = null;

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
});

function formatPrice(priceCents) {
  return currencyFormatter.format(priceCents / 100);
}

function validateEventData(data) {
  if (!data || typeof data !== "object" || typeof data.name !== "string") {
    throw new TypeError("Event data must include a name.");
  }

  if (!data.categories || typeof data.categories !== "object" || Array.isArray(data.categories)) {
    throw new TypeError("Event data must include seat categories.");
  }

  if (!data.rows || typeof data.rows !== "object" || Array.isArray(data.rows)) {
    throw new TypeError("Event data must include seat rows.");
  }

  for (const rowName of ROW_NAMES) {
    const category = data.rows[rowName];
    if (
      typeof category !== "string"
      || !Object.prototype.hasOwnProperty.call(data.categories, category)
    ) {
      throw new TypeError(`Row ${rowName} must reference a defined seat category.`);
    }
  }

  for (const [category, priceCents] of Object.entries(data.categories)) {
    if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
      throw new TypeError(`Category "${category}" must have a non-negative integer price in cents.`);
    }
  }

  if (!Array.isArray(data.sold) || data.sold.some((seatId) => typeof seatId !== "string")) {
    throw new TypeError("Event data must include a list of sold seat IDs.");
  }

  const knownSeatIds = new Set(
    ROW_NAMES.flatMap((row) =>
      Array.from(
        { length: LAST_SEAT_NUMBER - FIRST_SEAT_NUMBER + 1 },
        (_, index) => `${row}${index + FIRST_SEAT_NUMBER}`,
      ),
    ),
  );

  if (data.sold.some((seatId) => !knownSeatIds.has(seatId))) {
    throw new TypeError("Event data contains an invalid sold seat ID.");
  }

  return data;
}

function setLoading(isLoading) {
  loading = isLoading;
  elements.loadingState.hidden = !isLoading;
  elements.loadError.hidden = true;
  elements.seatMap.setAttribute("aria-busy", String(isLoading));
  elements.seatMap.hidden = isLoading || !eventData;
  elements.retryButton.disabled = isLoading;
}

function showLoadError(error) {
  console.error("Unable to load event data.", error);
  elements.loadingState.hidden = true;
  elements.loadErrorMessage.textContent = "The event could not be loaded. Check your connection and try again.";
  elements.loadError.hidden = false;
  elements.seatMap.hidden = true;
  elements.seatMap.setAttribute("aria-busy", "false");
}

async function loadEvent() {
  setLoading(true);

  try {
    const response = await fetch("./event.json");

    if (!response.ok) {
      throw new Error(`Event request failed with status ${response.status}.`);
    }

    const loadedEvent = validateEventData(await response.json());
    eventData = { ...loadedEvent, sold: [...loadedEvent.sold] };

    elements.eventTitle.textContent = eventData.name;
    document.title = eventData.name;
    renderCategoryLegend();
    renderSeatMap();
    renderSelectionSummary();
    setLoading(false);
  } catch (error) {
    setLoading(false);
    showLoadError(error);
  }
}

function renderCategoryLegend() {
  const legendItems = Object.entries(eventData.categories).map(([category, priceCents]) => {
    const item = document.createElement("li");
    const categoryName = document.createElement("span");
    const price = document.createElement("span");

    categoryName.textContent = category;
    price.textContent = formatPrice(priceCents);
    item.append(categoryName, price);

    return item;
  });

  elements.categoryLegend.replaceChildren(...legendItems);
}

function getSeatAccessibleName(seat) {
  return `Row ${seat.row}, seat ${seat.number}, ${seat.category}, ${formatPrice(seat.priceCents)}, ${seat.status}`;
}

function createSeatButton(seatId, activeSeatId) {
  const seat = getSeatDetails(seatId, eventData);
  const button = document.createElement("button");

  button.type = "button";
  button.className = "seat";
  button.dataset.seatId = seatId;
  button.textContent = String(seat.number);
  button.setAttribute("aria-label", getSeatAccessibleName(seat));
  button.setAttribute("aria-pressed", String(selectedSeatIds.includes(seatId)));
  button.tabIndex = seatId === activeSeatId ? 0 : -1;
  button.disabled = !seat.available;

  return button;
}

function getActiveSeatId() {
  const currentSeatId = document.activeElement?.dataset?.seatId;
  const preferredSeatId = currentSeatId || rovingSeatId;
  const activeSeat = preferredSeatId && getSeatDetails(preferredSeatId, eventData);

  if (activeSeat?.available) {
    return preferredSeatId;
  }

  const firstAvailableSeat = getAllSeatIds()
    .find((seatId) => getSeatDetails(seatId, eventData).available);

  rovingSeatId = firstAvailableSeat ?? null;
  return rovingSeatId;
}

function getAllSeatIds() {
  return ROW_NAMES.flatMap((row) =>
    Array.from(
      { length: LAST_SEAT_NUMBER - FIRST_SEAT_NUMBER + 1 },
      (_, index) => `${row}${index + FIRST_SEAT_NUMBER}`,
    ),
  );
}

function renderSeatMap() {
  const activeSeatId = getActiveSeatId();
  const rows = ROW_NAMES.map((rowName) => {
    const row = document.createElement("div");
    const category = eventData.rows[rowName];

    row.className = "seat-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", `Row ${rowName}, ${category}`);

    for (let seatNumber = FIRST_SEAT_NUMBER; seatNumber <= LAST_SEAT_NUMBER; seatNumber += 1) {
      row.append(createSeatButton(`${rowName}${seatNumber}`, activeSeatId));
    }

    return row;
  });

  elements.seatMap.replaceChildren(...rows);
  elements.seatMap.tabIndex = -1;
}

function renderSelectionSummary() {
  const selectedItems = selectedSeatIds.map((seatId) => {
    const seat = getSeatDetails(seatId, eventData);
    const item = document.createElement("li");

    item.textContent = `${seatId} — ${seat.category}, ${formatPrice(seat.priceCents)}`;
    return item;
  });

  elements.selectedSeatList.replaceChildren(
    ...(selectedItems.length > 0
      ? selectedItems
      : [document.createElement("li")]),
  );

  if (selectedItems.length === 0) {
    elements.selectedSeatList.firstElementChild.textContent = "No seats selected.";
  }

  try {
    const { totalCents } = calculateBookingPrice(selectedSeatIds, eventData);
    elements.totalPrice.textContent = formatPrice(totalCents);
  } catch (error) {
    console.error("Unable to calculate the current booking price.", error);
    elements.totalPrice.textContent = "Price unavailable";
  }
}

function clearSelectionErrors() {
  elements.selectionErrors.replaceChildren();
  elements.selectionErrors.hidden = true;
}

function displaySelectionErrors(issues) {
  const messages = issues.map((issue) => {
    const item = document.createElement("li");
    item.textContent = issue.message;
    return item;
  });

  elements.selectionErrors.replaceChildren(...messages);
  elements.selectionErrors.hidden = messages.length === 0;
}

function handleSeatClick(event) {
  const seatButton = event.target.closest("button[data-seat-id]");

  if (!seatButton || !elements.seatMap.contains(seatButton) || !eventData) {
    return;
  }

  try {
    selectedSeatIds = toggleSeatSelection(selectedSeatIds, seatButton.dataset.seatId, eventData);
    clearSelectionErrors();
    renderSeatMap();
    renderSelectionSummary();
    elements.seatMap.querySelector('[tabindex="0"]')?.focus();
  } catch (error) {
    console.error("Unable to update seat selection.", error);
    elements.bookingAnnouncement.textContent = error.message;
  }
}

function handleSeatMapKeydown(event) {
  const currentButton = event.target.closest("button[data-seat-id]");

  if (!currentButton || !elements.seatMap.contains(currentButton)) {
    return;
  }

  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  event.preventDefault();

  const currentRowIndex = ROW_NAMES.indexOf(currentButton.dataset.seatId[0]);
  const currentSeatNumber = Number(currentButton.dataset.seatId.slice(1));
  const rowStep = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  const seatStep = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  const rowIndex = currentRowIndex + rowStep;
  let seatNumber = currentSeatNumber + seatStep;

  if (rowIndex < 0 || rowIndex >= ROW_NAMES.length) {
    return;
  }

  while (seatNumber >= FIRST_SEAT_NUMBER && seatNumber <= LAST_SEAT_NUMBER) {
    const nextSeatId = `${ROW_NAMES[rowIndex]}${seatNumber}`;
    const nextButton = elements.seatMap.querySelector(`[data-seat-id="${nextSeatId}"]`);

    if (nextButton && !nextButton.disabled) {
      nextButton.focus();
      return;
    }

    if (seatStep === 0) {
      return;
    }

    seatNumber += seatStep;
  }
}

function displayCheckoutErrors(errors) {
  const errorItems = errors.map((error) => {
    const item = document.createElement("li");
    item.textContent = error.message;
    return item;
  });

  elements.checkoutErrors.replaceChildren(...errorItems);
  elements.checkoutErrors.hidden = errorItems.length === 0;

  for (const field of [elements.customerName, elements.customerEmail]) {
    field.removeAttribute("aria-invalid");
  }

  for (const error of errors) {
    error.field.setAttribute("aria-invalid", "true");
    error.field.setAttribute("aria-describedby", "checkout-errors");
  }

  if (errors.length > 0) {
    errors[0].field.focus();
  }
}

function validateCheckoutForm() {
  const errors = [];
  const name = elements.customerName.value.trim();
  const email = elements.customerEmail.value.trim();

  if (!name) {
    errors.push({
      field: elements.customerName,
      message: "Enter your name.",
    });
  }

  if (!email || elements.customerEmail.validity.valueMissing) {
    errors.push({
      field: elements.customerEmail,
      message: "Enter your email address.",
    });
  } else if (elements.customerEmail.validity.typeMismatch) {
    errors.push({
      field: elements.customerEmail,
      message: "Enter a valid email address.",
    });
  }

  displayCheckoutErrors(errors);
  return errors.length === 0;
}

function openCheckout() {
  if (loading || !eventData) {
    displaySelectionErrors([{ message: "Event seats are still loading. Please try again shortly." }]);
    return;
  }

  const issues = validateSelection(selectedSeatIds, eventData);
  displaySelectionErrors(issues);

  if (issues.length > 0) {
    elements.seatMap.querySelector('[tabindex="0"]')?.focus();
    return;
  }

  elements.checkoutForm.noValidate = true;
  elements.checkoutErrors.replaceChildren();
  elements.checkoutErrors.hidden = true;
  elements.customerName.removeAttribute("aria-invalid");
  elements.customerEmail.removeAttribute("aria-invalid");
  elements.checkoutDialog.showModal();
  elements.customerName.focus();
}

function closeCheckout() {
  if (elements.checkoutDialog.open) {
    elements.checkoutDialog.close();
  }
}

function confirmBooking() {
  eventData = {
    ...eventData,
    sold: [...new Set([...eventData.sold, ...selectedSeatIds])],
  };
  selectedSeatIds = [];

  clearSelectionErrors();
  renderSeatMap();
  renderSelectionSummary();
  elements.checkoutForm.reset();
  elements.checkoutErrors.replaceChildren();
  elements.checkoutErrors.hidden = true;
  elements.bookingAnnouncement.textContent = "Booking confirmed.";
  closeCheckout();
}

elements.retryButton.addEventListener("click", loadEvent);
elements.seatMap.addEventListener("click", handleSeatClick);
elements.seatMap.addEventListener("keydown", handleSeatMapKeydown);
elements.seatMap.addEventListener("focusin", (event) => {
  const focusedSeat = event.target.closest("button[data-seat-id]");

  if (!focusedSeat || focusedSeat.disabled) {
    return;
  }

  rovingSeatId = focusedSeat.dataset.seatId;
  for (const seatButton of elements.seatMap.querySelectorAll("button[data-seat-id]")) {
    seatButton.tabIndex = seatButton === focusedSeat ? 0 : -1;
  }
});
elements.continueButton.addEventListener("click", openCheckout);
elements.cancelCheckoutButton.addEventListener("click", closeCheckout);
elements.checkoutDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCheckout();
});
elements.checkoutDialog.addEventListener("close", () => {
  elements.continueButton.focus();
});
elements.checkoutForm.addEventListener("input", () => {
  elements.checkoutErrors.replaceChildren();
  elements.checkoutErrors.hidden = true;
  elements.customerName.removeAttribute("aria-invalid");
  elements.customerEmail.removeAttribute("aria-invalid");
  elements.customerName.removeAttribute("aria-describedby");
  elements.customerEmail.removeAttribute("aria-describedby");
});
elements.checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (validateCheckoutForm()) {
    confirmBooking();
  }
});

elements.continueButton.disabled = false;
elements.checkoutForm.noValidate = true;
elements.seatMap.hidden = true;
loadEvent();
