// #region Time Parsing

export const parseTime = (timeStr: string): Date => {
  const [time, ampm] = timeStr.split(" ");
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1);
  let h = hours;
  if (ampm === "AM" && hours === 12) h = 0;
  else if (ampm === "PM" && hours !== 12) h = hours + 12;
  if (h < 4) date.setDate(2);
  date.setHours(h, minutes, 0, 0);
  return date;
};

// #endregion

// #region Distance

export const haversineDistance = (
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number => {
  const R = 3958.8;
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// #endregion