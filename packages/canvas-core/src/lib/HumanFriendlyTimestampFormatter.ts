import { format, isToday, isYesterday } from "date-fns";

export class HumanFriendlyTimestampFormatter {
  static formatRunListWhen(value: string | undefined): string {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    const time = format(date, "HH:mm");
    if (isToday(date)) {
      return `Today · ${time}`;
    }
    if (isYesterday(date)) {
      return `Yesterday · ${time}`;
    }
    return format(date, "EEE d MMM yyyy · HH:mm");
  }
}
