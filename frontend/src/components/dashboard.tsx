import { ApprovalRateCard } from "./dashboard/approval-rate";
import { ExpertsPerformance } from "./dashboard/experts-performance";
import { GoldenDataset } from "./dashboard/golden-dataset";
import { ModeratorsOverview } from "./dashboard/overview";
import { QuestionStatusCharts } from "./dashboard/question-status";
import { QuestionsAnalytics } from "./dashboard/questions-analytics";
import { SourcesChart } from "./dashboard/sources-chart";

export const Dashboard = () => {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto p-6">
        {/* <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Moderator Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor content moderation and expert performance
          </p>
        </div> */}

        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <ModeratorsOverview />
          <ApprovalRateCard />
        </div>

        {/* Full Width Sources Chart */}
        <div className="mb-6">
          <GoldenDataset />
        </div>
        <div className="mb-6">
          <SourcesChart />
        </div>

        {/* Question Status and Golden Dataset Row */}
        <div className=" mb-6">
          <QuestionStatusCharts />
          {/* <GoldenDataset /> */}
        </div>

        {/* Performance Row */}
        <div className="mb-6">
          <QuestionsAnalytics />
        </div>

        {/* Analytics Row */}
        <div>
          <ExpertsPerformance />
        </div>
      </div>
    </main>
  );
};
