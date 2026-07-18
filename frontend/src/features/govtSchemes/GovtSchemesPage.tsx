import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGetSchemes } from "@/hooks/api/schemes/useGetSchemes";
import { useGetSchemeCategories } from "@/hooks/api/schemes/useGetSchemeCategories";
import { useGetSchemeStates } from "@/hooks/api/schemes/useGetSchemeStates";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Search,
  Filter,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Calendar,
  MapPin,
  Users,
  CheckCircle,
  X,
} from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import type { IScheme } from "@/hooks/services/schemeService";

const categoryColors: Record<string, string> = {
  Subsidy: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Insurance: "bg-blue-100 text-blue-800 border-blue-200",
  Credit: "bg-amber-100 text-amber-800 border-amber-200",
  Marketing: "bg-purple-100 text-purple-800 border-purple-200",
  "Organic Farming": "bg-green-100 text-green-800 border-green-200",
  Irrigation: "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Crop Loss": "bg-rose-100 text-rose-800 border-rose-200",
};

function SchemeCardSkeleton() {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <div className="pt-2 flex items-center gap-2">
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function SchemeDetailDialog({
  scheme,
  open,
  onOpenChange,
}: {
  scheme: IScheme | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("schemes");
  if (!scheme) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-6">
            <div className="flex-shrink-0 mt-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100">
                <Landmark className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-left leading-tight">
                {scheme.name}
              </DialogTitle>
              <DialogDescription className="text-left mt-1">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    categoryColors[scheme.category] || "bg-gray-100 text-gray-800 border-gray-200"
                  }`}
                >
                  {scheme.category}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5">{t("detail.description")}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {scheme.description}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              {t("detail.keyBenefits")}
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {scheme.benefits}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-blue-500" />
              {t("detail.eligibility")}
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {scheme.eligibility}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5">
              {t("detail.applicationProcess")}
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {scheme.applicationProcess}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2 rounded-lg border p-3">
              <Calendar className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("detail.deadline")}</p>
                <p className="text-sm font-medium">{scheme.deadline}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border p-3">
              <MapPin className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("detail.states")}</p>
                <p className="text-sm font-medium">{scheme.states.join(", ")}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">{t("detail.contact")}</p>
            <p className="text-sm">{scheme.contactInfo}</p>
          </div>

          <div className="pt-2">
            <a
              href={scheme.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {t("detail.visitWebsite")}
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GovtSchemesPage() {
  const { t } = useTranslation("schemes");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedScheme, setSelectedScheme] = useState<IScheme | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [activeSearch, setActiveSearch] = useState("");

  const queryParams = useMemo(
    () => ({
      category: category || undefined,
      state: state || undefined,
      search: activeSearch || undefined,
      page,
      limit: 12,
    }),
    [category, state, activeSearch, page]
  );

  const { data, isLoading, isFetching } = useGetSchemes(queryParams);
  const { data: categories = [] } = useGetSchemeCategories();
  const { data: states = [] } = useGetSchemeStates();

  const schemes = data?.schemes || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = data?.totalPages || 1;

  const handleSearch = () => {
    setActiveSearch(searchInput);
    setPage(1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value === "all" ? "" : value);
    setPage(1);
  };

  const handleStateChange = (value: string) => {
    setState(value === "all" ? "" : value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setActiveSearch("");
    setCategory("");
    setState("");
    setPage(1);
  };

  const openSchemeDetail = (scheme: IScheme) => {
    setSelectedScheme(scheme);
    setDialogOpen(true);
  };

  const hasFilters = activeSearch || category || state;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                <Landmark className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {t("title")}
              </h1>
            </div>
            <LanguageSelector />
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm sm:text-base ml-[52px]">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filter Bar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              {/* Search */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("search.placeholder")}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleSearch} variant="default" className="sm:w-auto bg-emerald-600 hover:bg-emerald-700">
                  <Search className="h-4 w-4 mr-1" />
                  {t("search.button")}
                </Button>
              </div>

              {/* Dropdowns */}
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("filters.label")}</span>
                </div>
                <Select value={category || "all"} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder={t("filters.allCategories")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.allCategories")}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={state || "all"} onValueChange={handleStateChange}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder={t("filters.allStates")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.allStates")}</SelectItem>
                    {states.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    {t("filters.clear")}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {isLoading ? (
              t("results.loading")
            ) : (
              <>
                {t("results.showing")} <span className="font-medium text-foreground">{schemes.length}</span> {t("results.of")}{" "}
                <span className="font-medium text-foreground">{totalCount}</span> {t("results.schemes")}
                {hasFilters && ` ${t("results.matchingFilters")}`}
              </>
            )}
          </p>
          {isFetching && !isLoading && (
            <span className="text-xs text-muted-foreground animate-pulse">{t("results.refreshing")}</span>
          )}
        </div>

        {/* Schemes Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SchemeCardSkeleton key={i} />
            ))}
          </div>
        ) : schemes.length === 0 ? (
          <Card className="py-16">
            <CardContent className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                  <Landmark className="h-8 w-8 text-muted-foreground/50" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">{t("empty.title")}</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {t("empty.description")}
              </p>
              <Button variant="outline" onClick={handleClearFilters} className="mt-4">
                {t("empty.clearAll")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schemes.map((scheme) => (
              <Card
                key={scheme.id}
                className="hover:shadow-md transition-all cursor-pointer group border-border/60 hover:border-emerald-300 dark:hover:border-emerald-700"
                onClick={() => openSchemeDetail(scheme)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {scheme.name}
                    </CardTitle>
                    <span
                      className={`flex-shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                        categoryColors[scheme.category] || "bg-gray-100 text-gray-800 border-gray-200"
                      }`}
                    >
                      {scheme.category}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                    {scheme.description}
                  </p>
                  <div className="border-t pt-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">{t("card.keyBenefits")}</p>
                    <p className="text-xs text-foreground leading-relaxed line-clamp-2">
                      {scheme.benefits}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {scheme.states.length === 1 && scheme.states[0] === "All India"
                        ? t("card.allIndia")
                        : t("card.statesCount", { count: scheme.states.length })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {scheme.deadline.length > 25
                        ? scheme.deadline.slice(0, 25) + "..."
                        : scheme.deadline}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("pagination.previous")}
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === page ? "default" : "outline"}
                    size="sm"
                    className={`w-9 ${pageNum === page ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {t("pagination.next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <SchemeDetailDialog
        scheme={selectedScheme}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
