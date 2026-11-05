const FIRST_SEAT_NUMBER = 1;
const LAST_SEAT_NUMBER = 10;
const MAX_SELECTED_SEATS = 6;
const DISCOUNT_THRESHOLD = 4;
const DISCOUNT_DIVISOR = 10;

function assertSeatIdArray(seatIds, parameterName) {
  if (!Array.isArray(seatIds) || seatIds.some((seatId) => typeof seatId !== "string")) {
    throw new TypeError(`${parameterName} must be an array of seat ID strings.`);
  }
}

function parseSeatId(seatId) {
  const match = /^([A-Z])(10|[1-9])$/.exec(seatId);

  if (!match) {
    return null;
  }

  return { row: match[1], number: Number(match[2]) };
}

function getSeatPrice(category, eventData) {
  const priceCents = eventData.categories?.[category];

  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new TypeError(`The price for category "${category}" must be a non-negative integer in cents.`);
  }

  return priceCents;
}

function getKnownSeat(seatId, eventData) {
  const parsedSeat = parseSeatId(seatId);

  if (!parsedSeat || !Object.prototype.hasOwnProperty.call(eventData.rows ?? {}, parsedSeat.row)) {
    return null;
  }

  const category = eventData.rows[parsedSeat.row];

  return {
    id: seatId,
    row: parsedSeat.row,
    number: parsedSeat.number,
    category,
    priceCents: getSeatPrice(category, eventData),
  };
}

function addIssue(issues, code, message, seatIds) {
  issues.push({ code, message, seatIds });
}

export function getSeatDetails(seatId, eventData) {
  if (typeof seatId !== "string" || !eventData || typeof eventData !== "object") {
    return null;
  }

  const seat = getKnownSeat(seatId, eventData);

  if (!seat) {
    return null;
  }

  const sold = (eventData.sold ?? []).includes(seatId);

  return {
    ...seat,
    status: sold ? "sold" : "available",
    available: !sold,
  };
}

export function toggleSeatSelection(selectedSeatIds, seatId, eventData) {
  assertSeatIdArray(selectedSeatIds, "selectedSeatIds");

  const seat = getSeatDetails(seatId, eventData);

  if (!seat) {
    throw new Error(`Unknown seat "${seatId}".`);
  }

  if (!seat.available) {
    throw new Error(`Seat "${seatId}" is already sold.`);
  }

  if (selectedSeatIds.includes(seatId)) {
    return selectedSeatIds.filter((selectedSeatId) => selectedSeatId !== seatId);
  }

  return [...selectedSeatIds, seatId];
}

export function validateSelection(selectedSeatIds, eventData) {
  assertSeatIdArray(selectedSeatIds, "selectedSeatIds");

  if (!eventData || typeof eventData !== "object") {
    throw new TypeError("eventData must be an event data object.");
  }

  const issues = [];

  if (selectedSeatIds.length === 0) {
    addIssue(issues, "no-seats", "Select at least one seat.", []);
    return issues;
  }

  if (selectedSeatIds.length > MAX_SELECTED_SEATS) {
    addIssue(
      issues,
      "too-many-seats",
      `Select no more than ${MAX_SELECTED_SEATS} seats.`,
      selectedSeatIds,
    );
  }

  const selectedSeatSet = new Set(selectedSeatIds);
  for (const seatId of selectedSeatIds) {
    if (!getKnownSeat(seatId, eventData)) {
      addIssue(issues, "unknown-seat", `Seat "${seatId}" does not exist.`, [seatId]);
      continue;
    }

    if ((eventData.sold ?? []).includes(seatId)) {
      addIssue(issues, "sold-seat", `Seat "${seatId}" is already sold.`, [seatId]);
    }
  }

  const seenSeatIds = new Set();
  for (const seatId of selectedSeatIds) {
    if (seenSeatIds.has(seatId)) {
      addIssue(issues, "duplicate-seat", `Seat "${seatId}" was selected more than once.`, [seatId]);
    }
    seenSeatIds.add(seatId);
  }

  const soldSeatSet = new Set(eventData.sold ?? []);
  const rowNames = Object.keys(eventData.rows ?? {});

  for (const row of rowNames) {
    for (let number = FIRST_SEAT_NUMBER; number <= LAST_SEAT_NUMBER; number += 1) {
      const seatId = `${row}${number}`;

      if (soldSeatSet.has(seatId) || selectedSeatSet.has(seatId)) {
        continue;
      }

      const leftSeatId = number > FIRST_SEAT_NUMBER ? `${row}${number - 1}` : null;
      const rightSeatId = number < LAST_SEAT_NUMBER ? `${row}${number + 1}` : null;
      const leftUnavailable = leftSeatId === null
        || soldSeatSet.has(leftSeatId)
        || selectedSeatSet.has(leftSeatId);
      const rightUnavailable = rightSeatId === null
        || soldSeatSet.has(rightSeatId)
        || selectedSeatSet.has(rightSeatId);
      const selectedNextToSeat = (leftSeatId && selectedSeatSet.has(leftSeatId))
        || (rightSeatId && selectedSeatSet.has(rightSeatId));

      if (selectedNextToSeat && leftUnavailable && rightUnavailable) {
        addIssue(
          issues,
          "isolated-seat",
          `Selection would leave seat "${seatId}" as a single free seat.`,
          [seatId],
        );
      }
    }
  }

  return issues;
}

export function calculateBookingPrice(selectedSeatIds, eventData) {
  assertSeatIdArray(selectedSeatIds, "selectedSeatIds");

  const seenSeatIds = new Set();
  let subtotalCents = 0;

  for (const seatId of selectedSeatIds) {
    if (seenSeatIds.has(seatId)) {
      throw new Error(`Seat "${seatId}" was included more than once.`);
    }
    seenSeatIds.add(seatId);

    const seat = getSeatDetails(seatId, eventData);

    if (!seat) {
      throw new Error(`Unknown seat "${seatId}".`);
    }

    if (!seat.available) {
      throw new Error(`Seat "${seatId}" is already sold.`);
    }

    subtotalCents += seat.priceCents;

    if (!Number.isSafeInteger(subtotalCents)) {
      throw new RangeError("The booking subtotal exceeds the safe integer range.");
    }
  }

  let discountCents = 0;

  if (selectedSeatIds.length >= DISCOUNT_THRESHOLD) {
    const wholeTens = Math.floor(subtotalCents / DISCOUNT_DIVISOR);
    const remainder = subtotalCents % DISCOUNT_DIVISOR;
    discountCents = wholeTens + (remainder >= DISCOUNT_DIVISOR / 2 ? 1 : 0);
  }

  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
