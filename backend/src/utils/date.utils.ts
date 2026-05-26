export function isToday(date?: Date): boolean {
  if (!date) return false;

  const today = new Date();
  const d = new Date(date);

  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

  /**
   * Returns MongoDB hour expression in IST timezone
   */
  function getHourExpression (field: string) {
    return {
      $hour: {
        date: `$${field}`,
        timezone: "Asia/Kolkata",
      },
    };
  }

  /**
   * Shift filter generator
   */
  export function getShiftFilter (field: string, shift: "morning" | "evening" | "all") {

    if (shift === "all") {
      return {};
    }

    /**
     * Morning Shift
     * 06:00 AM → 02:59 PM
     */
    if (shift === "morning") {
      return {
        $expr: {
          $and: [
            {
              $gte: [
                getHourExpression(field),
                6,
              ],
            },
            {
              $lt: [
                getHourExpression(field),
                15,
              ],
            },
          ],
        },
      };
    }

    /**
     * Evening Shift
     * 03:00 PM → 11:59 PM
     */
    if (shift === "evening") {
      return {
        $expr: {
          $and: [
            {
              $gte: [
                getHourExpression(field),
                15,
              ],
            },
            {
              $lt: [
                getHourExpression(field),
                24,
              ],
            },
          ],
        },
      };
    }

    return {};
  };
