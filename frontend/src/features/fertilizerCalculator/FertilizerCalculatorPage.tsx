import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Droplets,
  Leaf,
  Calculator,
  TrendingDown,
  CheckCircle,
  DollarSign,
  Beaker,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Badge } from "@/components/atoms/badge";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/atoms/table";
import { useCalculateFertilizer } from "@/hooks/api/fertilizer/useCalculateFertilizer";
import { useGetFertilizerCrops } from "@/hooks/api/fertilizer/useGetFertilizerCrops";
import { useGetSoilTypes } from "@/hooks/api/fertilizer/useGetSoilTypes";
import { LanguageSelector } from "@/components/LanguageSelector";
import type { IFertilizerCalculation } from "@/hooks/services/fertilizerService";

const CROP_LIST = [
  "Rice",
  "Wheat",
  "Maize",
  "Cotton",
  "Soybean",
  "Groundnut",
  "Sugarcane",
  "Banana",
  "Mango",
  "Potato",
  "Onion",
  "Tomato",
];

const SOIL_LIST = ["Alluvial", "Black (Regur)", "Red", "Laterite", "Sandy"];

function NPKBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-sm font-semibold tabular-nums">{value.toFixed(0)} kg</span>
    </div>
  );
}

function RecommendationCard({
  title,
  amount,
  fertilizer,
  bags,
  cost,
  color,
  icon,
}: {
  title: string;
  amount: number;
  fertilizer: string;
  bags: number;
  cost: number;
  color: string;
  icon: React.ReactNode;
}) {
  const { t } = useTranslation("fertilizer");
  return (
    <Card className={`border-l-4 ${color}`}>
      <CardContent className="pt-6 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          <Badge variant="secondary">{fertilizer}</Badge>
        </div>
        <div className="text-2xl font-bold">{amount.toFixed(1)} {t("npk.kg")}</div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{bags} {bags !== 1 ? t("npk.bags") : t("npk.bag")}</span>
          <span className="font-semibold text-foreground">₹{cost.toLocaleString("en-IN")}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function FertilizerCalculatorPage() {
  const { t } = useTranslation("fertilizer");
  const [crop, setCrop] = useState("");
  const [area, setArea] = useState<string>("");
  const [soilType, setSoilType] = useState("");
  const [result, setResult] = useState<IFertilizerCalculation | null>(null);

  const calculateMutation = useCalculateFertilizer();
  const { data: crops, isLoading: cropsLoading } = useGetFertilizerCrops();
  const { data: soilTypes, isLoading: soilsLoading } = useGetSoilTypes();

  const handleCalculate = () => {
    if (!crop || !area || !soilType) return;
    calculateMutation.mutate(
      { crop, areaInAcres: parseFloat(area), soilType },
      {
        onSuccess: (data) => setResult(data),
      }
    );
  };

  const maxNPK = result
    ? Math.max(
        result.recommendations.nitrogen.required,
        result.recommendations.phosphorus.required,
        result.recommendations.potassium.required,
        1
      )
    : 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/60 via-white to-green-50/40">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-emerald-100 text-emerald-700">
              <Calculator className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>
          </div>
          <LanguageSelector />
        </div>

        {/* Input Form */}
        <Card className="border-emerald-200/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Beaker className="size-5 text-emerald-600" />
              {t("form.title")}
            </CardTitle>
            <CardDescription>
              {t("form.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("form.crop")}</label>
                <Select value={crop} onValueChange={setCrop}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("form.selectCrop")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(crops?.length ? crops.map((c) => c.name) : CROP_LIST).map((name) => (
                      <SelectItem key={name} value={name}>
                        {t(`cropNames.${name}`, { defaultValue: name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("form.area")}</label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder={t("form.areaPlaceholder")}
                    min={0.1}
                    step={0.1}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                    {t("form.acres")}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("form.soilType")}</label>
                <Select value={soilType} onValueChange={setSoilType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("form.selectSoil")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(soilsLoading
                      ? SOIL_LIST
                      : soilTypes?.map((s) => s.name) || SOIL_LIST
                    ).map((name) => (
                      <SelectItem key={name} value={name}>
                        {t(`soilTypes.${name}`, { defaultValue: name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleCalculate}
                disabled={!crop || !area || !soilType || calculateMutation.isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {calculateMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("form.calculating")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Calculator className="size-4" />
                    {t("form.calculate")}
                  </span>
                )}
              </Button>
            </div>

            {calculateMutation.isError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {calculateMutation.error?.message || t("form.error")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {calculateMutation.isPending && <ResultSkeleton />}

        {result && !calculateMutation.isPending && (
          <div className="space-y-6">
            {/* Cost Summary */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <DollarSign className="size-6" />
                <div>
                  <p className="text-sm text-emerald-100">{t("results.totalCost")}</p>
                  <p className="text-3xl font-bold">
                    ₹{result.totalCost.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <div className="text-right text-sm text-emerald-100">
                <p>
                  {result.areaInAcres} {result.areaInAcres !== 1 ? t("results.acres") : t("results.acre")} • {result.crop}
                </p>
                <p>{result.soilType} {t("results.soil")}</p>
              </div>
            </div>

            {/* NPK Recommendation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <RecommendationCard
                title={t("npk.nitrogen")}
                amount={result.recommendations.nitrogen.required}
                fertilizer={result.recommendations.nitrogen.fertilizer}
                bags={result.recommendations.nitrogen.bags}
                cost={result.recommendations.nitrogen.cost}
                color="border-l-blue-500"
                icon={<Leaf className="size-5 text-blue-500" />}
              />
              <RecommendationCard
                title={t("npk.phosphorus")}
                amount={result.recommendations.phosphorus.required}
                fertilizer={result.recommendations.phosphorus.fertilizer}
                bags={result.recommendations.phosphorus.bags}
                cost={result.recommendations.phosphorus.cost}
                color="border-l-orange-500"
                icon={<TrendingDown className="size-5 text-orange-500" />}
              />
              <RecommendationCard
                title={t("npk.potassium")}
                amount={result.recommendations.potassium.required}
                fertilizer={result.recommendations.potassium.fertilizer}
                bags={result.recommendations.potassium.bags}
                cost={result.recommendations.potassium.cost}
                color="border-l-purple-500"
                icon={<Droplets className="size-5 text-purple-500" />}
              />
            </div>

            {/* NPK Visual Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("chart.title")}</CardTitle>
                <CardDescription>{t("chart.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <NPKBar
                  label="N"
                  value={result.recommendations.nitrogen.required / result.areaInAcres}
                  max={maxNPK / result.areaInAcres}
                  color="bg-blue-500"
                />
                <NPKBar
                  label="P"
                  value={result.recommendations.phosphorus.required / result.areaInAcres}
                  max={maxNPK / result.areaInAcres}
                  color="bg-orange-500"
                />
                <NPKBar
                  label="K"
                  value={result.recommendations.potassium.required / result.areaInAcres}
                  max={maxNPK / result.areaInAcres}
                  color="bg-purple-500"
                />
              </CardContent>
            </Card>

            {/* Application Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle className="size-5 text-emerald-600" />
                  {t("tips.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.applicationTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="size-4 mt-0.5 text-emerald-500 shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Supported Crops Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Leaf className="size-5 text-emerald-600" />
              {t("crops.title")}
            </CardTitle>
            <CardDescription>
              {t("crops.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cropsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("crops.crop")}</TableHead>
                    <TableHead>{t("crops.category")}</TableHead>
                    <TableHead className="text-right">{t("crops.nitrogen")}</TableHead>
                    <TableHead className="text-right">{t("crops.phosphorus")}</TableHead>
                    <TableHead className="text-right">{t("crops.potassium")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(crops?.length
                    ? crops
                    : CROP_LIST.map((name) => ({
                        name,
                        npk: { n: 0, p: 0, k: 0 },
                        category: "",
                      }))
                  ).map((c) => (
                    <TableRow
                      key={c.name}
                      className="cursor-pointer hover:bg-emerald-50/50"
                      onClick={() => setCrop(c.name)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{c.npk.n}</TableCell>
                      <TableCell className="text-right">{c.npk.p}</TableCell>
                      <TableCell className="text-right">{c.npk.k}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
