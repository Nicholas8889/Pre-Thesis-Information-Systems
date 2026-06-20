export function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatInvoiceCurrency(value: number) {
  return `Rp ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value)}`;
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function amountToWords(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "ZERO RUPIAH";
  }

  const rounded = Math.round(value);

  if (rounded === 0) {
    return "ZERO RUPIAH";
  }

  return `${numberToWords(rounded).toUpperCase()} RUPIAH`;
}

function numberToWords(value: number): string {
  const units = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen"
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety"
  ];

  if (value < 20) {
    return units[value];
  }

  if (value < 100) {
    return [tens[Math.floor(value / 10)], units[value % 10]].filter(Boolean).join(" ");
  }

  if (value < 1000) {
    return [
      units[Math.floor(value / 100)],
      "hundred",
      numberToWords(value % 100)
    ]
      .filter(Boolean)
      .join(" ");
  }

  const groups = [
    { value: 1_000_000_000, label: "billion" },
    { value: 1_000_000, label: "million" },
    { value: 1_000, label: "thousand" }
  ];

  for (const group of groups) {
    if (value >= group.value) {
      return [
        numberToWords(Math.floor(value / group.value)),
        group.label,
        numberToWords(value % group.value)
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  return "";
}
