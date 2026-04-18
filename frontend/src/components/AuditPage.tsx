import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "./atoms/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./atoms/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./atoms/dropdown-menu";
import { Button } from "./atoms/button";
import { Pagination } from "./pagination";
import { useGetAuditTrails } from "@/hooks/api/auditTrails/useGetAuditTrails";

const limit = 10;

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "-";

  if (Array.isArray(value)) {
    return value.map((v) => formatValue(v)).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

const renderDynamicObject = (obj: any) => {
  if (!obj || typeof obj !== "object") return "-";

  return Object.entries(obj)
    .filter(([key, value]) => {
      const lowerKey = key.toLowerCase();

      // Hide id fields and arrays of ids from context/details
      if (lowerKey.includes("id")) return false;

      if (
        Array.isArray(value) &&
        value.every(
          (item) =>
            typeof item === "string" &&
            item.length >= 20
        )
      ) {
        return false;
      }

      return true;
    })
    .map(([key, value]) => (
      <div key={key} className="mb-2 break-words">
        <span className="font-semibold">{key}: </span>
        <span>{formatValue(value)}</span>
      </div>
    ));
};

const AuditPage = () => {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"compact" | "detail">("compact");

  const { data, isLoading } = useGetAuditTrails(
    page,
    limit,
    startDate,
    endDate
  );

  const audits = data.data || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Trails</h1>
          <p className="text-sm text-muted-foreground">
            Track all moderator actions and system changes
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {viewMode === "compact" ? "Compact View" : "Detailed View"}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={viewMode}
              onValueChange={(value) =>
                setViewMode(value as "compact" | "detail")
              }
            >
              <DropdownMenuRadioItem value="compact">
                Compact View (Cards)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="detail">
                Detailed View (Table)
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : viewMode === "compact" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {audits.map((audit: any, index: number) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{audit.category}</CardTitle>
                <CardDescription>{audit.action}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                <div>
                  <span className="font-semibold">Name: </span>
                  {audit.actor?.name || "-"}
                </div>

                <div>
                  <span className="font-semibold">Role: </span>
                  {audit.actor?.role || "-"}
                </div>

                <div>
                  <span className="font-semibold">Created At: </span>
                  {new Date(audit.createdAt).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="max-h-[700px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {audits.map((audit: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>{audit.category}</TableCell>
                    <TableCell>{audit.action}</TableCell>

                    <TableCell>
                      <div>{audit.actor?.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {audit.actor?.role}
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[280px] align-top">
                      {renderDynamicObject(audit.context)}
                    </TableCell>

                    <TableCell className="max-w-[320px] align-top">
                      <div className="space-y-3 break-words">
                        <div>
                          <p className="font-semibold">Before</p>
                          {renderDynamicObject(audit.changes?.before)}
                        </div>

                        <div>
                          <p className="font-semibold">After</p>
                          {renderDynamicObject(audit.changes?.after)}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      {new Date(audit.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Pagination
        currentPage={page}
        onPageChange={setPage}
        totalPages={10}
      />
    </div>
  );
};

export default AuditPage;
