// India Standard Time is a fixed UTC+05:30 offset (no DST).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Absolute instant of the most recent IST (Asia/Kolkata) midnight — i.e. the start
 * of "today" as the team reads it. Use this instead of `new Date().setHours(0,0,0,0)`,
 * which resolves to the *server's* local midnight (UTC on Cloud Run) and therefore
 * drops rows timestamped between 00:00 and 05:30 IST.
 */
export function getISTStartOfToday(now: Date = new Date()): Date {
  // Shift into IST so the UTC calendar fields read as IST wall-clock, zero the
  // time, then shift back to a real UTC instant.
  const istWall = new Date(now.getTime() + IST_OFFSET_MS);
  istWall.setUTCHours(0, 0, 0, 0);
  return new Date(istWall.getTime() - IST_OFFSET_MS);
}

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
   * Returns MongoDB minute expression in IST timezone
   */
  function getMinuteExpression(field: string) {
  return {
    $minute: {
      date: `$${field}`,
      timezone: 'Asia/Kolkata',
    },
  };
}



  /**
   * Shift filter generator
   */
  // export function getShiftFilter (field: string, shift: "morning" | "evening" | "all") {

  //   if (shift === "all") {
  //     return {};
  //   }

  //   /**
  //    * Morning Shift
  //    * 06:00 AM → 02:59 PM
  //    */
  //   if (shift === "morning") {
  //     return {
  //       $expr: {
  //         $and: [
  //           {
  //             $gte: [
  //               getHourExpression(field),
  //               6,
  //             ],
  //           },
  //           {
  //             $lt: [
  //               getHourExpression(field),
  //               15,
  //             ],
  //           },
  //         ],
  //       },
  //     };
  //   }

  //   /**
  //    * Evening Shift
  //    * 03:00 PM → 11:59 PM
  //    */
  //   if (shift === "evening") {
  //     return {
  //       $expr: {
  //         $and: [
  //           {
  //             $gte: [
  //               getHourExpression(field),
  //               15,
  //             ],
  //           },
  //           {
  //             $lt: [
  //               getHourExpression(field),
  //               24,
  //             ],
  //           },
  //         ],
  //       },
  //     };
  //   }

  //   return {};
  // };

  /*new*/
  
 const defaults = {
    morning: {
      from: '06:00',
      to: '15:00',
    },
    evening: {
      from: '15:00',
      to: '23:59',
    },
    all: {
      from: '00:00',
      to: '23:59',
    },
  };
  export function getShiftFilter (field: string, shift: "morning" | "evening" | "all", from?:string, to?:string) {
    const startTime = from ?? defaults[shift].from;
    const endTime = to ?? defaults[shift].to;
    const [fromHour, fromMinute] = startTime.split(':').map(Number);
    const [toHour, toMinute] = endTime.split(':').map(Number);
    const fromTotalMinutes = fromHour * 60 + fromMinute;
    const toTotalMinutes = toHour * 60 + toMinute;
      return {
    $expr: {
      $and: [
        {
          $gte: [
            {
              $add: [
                {
                  $multiply: [
                    getHourExpression(field),
                    60,
                  ],
                },
                getMinuteExpression(field),
              ],
            },
            fromTotalMinutes,
          ],
        },
        {
          $lte: [
            {
              $add: [
                {
                  $multiply: [
                    getHourExpression(field),
                    60,
                  ],
                },
                getMinuteExpression(field),
              ],
            },
            toTotalMinutes,
          ],
        },
      ],
    },
  };
  };
