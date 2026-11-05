import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBookingPrice,
  getSeatDetails,
  toggleSeatSelection,
  validateSelection,
} from "../js/seats.js";

const eventData = {
  name: "Jazz Night",
  categories: { Front: 900, Standard: 1200, Premium: 1500 },
  rows: {
    A: "Front",
    B: "Front",
    C: "Standard",
    D: "Standard",
    E: "Premium",
    F: "Premium",
  },
  sold: ["C4", "C5", "D1", "D2", "E10"],
};

function getIssueCodes(selectedSeatIds, data = eventData) {
  return validateSelection(selectedSeatIds, data).map((issue) => issue.code);
}

test("provides seat details with category price and availability", () => {
  assert.deepEqual(getSeatDetails("C3", eventData), {
    id: "C3",
    row: "C",
    number: 3,
    category: "Standard",
    priceCents: 1200,
    status: "available",
    available: true,
  });
  assert.equal(getSeatDetails("C4", eventData).status, "sold");
  assert.equal(getSeatDetails("Z1", eventData), null);
});

test("toggles a seat without mutating the existing selection", () => {
  const selection = ["A1"];

  assert.deepEqual(toggleSeatSelection(selection, "A2", eventData), ["A1", "A2"]);
  assert.deepEqual(toggleSeatSelection(["A1", "A2"], "A1", eventData), ["A2"]);
  assert.deepEqual(selection, ["A1"]);
  assert.throws(() => toggleSeatSelection([], "C4", eventData), /already sold/);
});

test("reports an empty selection", () => {
  assert.deepEqual(getIssueCodes([]), ["no-seats"]);
});

test("accepts six selected seats and rejects more than six", () => {
  assert.deepEqual(getIssueCodes(["A1", "A2", "A3", "A4", "A5", "A6"]), []);
  assert(getIssueCodes(["A1", "A2", "A3", "A4", "A5", "A6", "A7"]).includes("too-many-seats"));
});

test("prevents isolated single free seats using the required row C examples", () => {
  assert.deepEqual(getIssueCodes(["C3"]), []);
  assert(getIssueCodes(["C7"]).includes("isolated-seat"));
  assert(getIssueCodes(["C1", "C2"]).includes("isolated-seat"));
  assert.deepEqual(getIssueCodes(["C1", "C2", "C3"]), []);
  assert(getIssueCodes(["C9"]).includes("isolated-seat"));
  assert.deepEqual(getIssueCodes(["C6", "C7", "C8"]), []);
});

test("detects isolated seats at row boundaries and beside sold seats", () => {
  assert(getIssueCodes(["A9"]).includes("isolated-seat"));

  const soldSeatsOnBothSides = {
    ...eventData,
    sold: [...eventData.sold, "B4", "B7"],
  };
  assert(getIssueCodes(["B5"], soldSeatsOnBothSides).includes("isolated-seat"));
});

test("reports selected sold seats", () => {
  assert(getIssueCodes(["C4"]).includes("sold-seat"));
  assert.throws(() => calculateBookingPrice(["C4"], eventData), /already sold/);
});

test("applies no discount to three seats and ten percent from four seats", () => {
  assert.deepEqual(calculateBookingPrice(["A1", "A2", "A3"], eventData), {
    subtotalCents: 2700,
    discountCents: 0,
    totalCents: 2700,
  });
  assert.deepEqual(calculateBookingPrice(["B1", "B2", "F5", "F6"], eventData), {
    subtotalCents: 4800,
    discountCents: 480,
    totalCents: 4320,
  });
});

test("calculates price from each selected seat category in integer cents", () => {
  assert.deepEqual(calculateBookingPrice(["A1", "C1", "E1"], eventData), {
    subtotalCents: 3600,
    discountCents: 0,
    totalCents: 3600,
  });
});
