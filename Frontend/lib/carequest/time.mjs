function zonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

export function localDateTimeToUtc(parts, timeLocal, timezone) {
  const [hour, minute] = String(timeLocal || "09:00").split(":").map(Number);
  let guess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, hour || 0, minute || 0, 0)
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(guess, timezone);
    const targetMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      hour || 0,
      minute || 0,
      0
    );
    const actualMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const delta = targetMs - actualMs;
    if (Math.abs(delta) < 1000) break;
    guess = new Date(guess.getTime() + delta);
  }

  return guess;
}
