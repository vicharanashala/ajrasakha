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
    console.log('shift:',shift)
    console.log('from:',from)
    console.log('to:',to)
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
