import { CheckCircle2, Clock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../atoms/card"

export function ApprovalRateCard() {

    const approved = 324
  const pending = 47
  const total = approved + pending
  const approvalRate = Math.round((approved / total) * 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Moderator Approval Rate</CardTitle>
        <CardDescription>Based on pending and approved answers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Approval Rate</span>
              <span className="text-2xl font-bold text-primary">{approvalRate}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${approvalRate}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="text-lg font-semibold text-foreground">{approved}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold text-foreground">{pending}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}