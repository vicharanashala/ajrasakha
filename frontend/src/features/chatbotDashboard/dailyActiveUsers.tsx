import React from "react";

const DailyActiveUsers = () => {
  const data = [
    30, 32, 35, 33, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72,
    75, 78, 80, 82, 85, 88, 90, 98, 95, 92, 90, 80,
  ];
  const maxData = Math.max(...data);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md font-sans">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Daily active users — 30 day trend
          </h2>
          <p className="text-sm text-gray-500">
            Farmers + KCC agents + agri experts
          </p>
        </div>
        <a href="#" className="text-green-600 text-sm font-semibold">
          Drill down &rarr;
        </a>
      </div>

      <div className="flex items-end h-60 border-b-2 border-gray-200 pb-2">
        {data.map((value, index) => {
          const height = (value / maxData) * 100;
          let barColor = "bg-green-500";
          if (value < 50) barColor = "bg-green-200";
          else if (value < 75) barColor = "bg-green-400";

          if (index === data.length - 1) {
            barColor = "bg-yellow-500";
          }

          return (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div
                className={`w-3/4 ${barColor} rounded-t-sm`}
                style={{ height: `${height}%` }}
              ></div>
              {(index === 0 ||
                index === 9 ||
                index === 19 ||
                index === data.length - 1) && (
                <div className="text-xs text-gray-500 mt-1">
                  {index === 0 && "Day 1"}
                  {index === 9 && "Day 10"}
                  {index === 19 && "Day 20"}
                  {index === data.length - 1 && "Today"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
        <div>
          <span className="font-semibold">Peak:</span> Day 26 ∙ 98,400
        </div>
        <div>
          <span className="font-semibold">Avg:</span> 71,200 / day
        </div>
        <div>
          <span className="font-semibold">Growth:</span>{" "}
          <span className="text-green-600 font-semibold">+18% MoM</span>
        </div>
      </div>
    </div>
  );
};

export default DailyActiveUsers;
