import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select";
import { Badge } from "@/components/atoms/badge";
import { Loader2, Leaf, Beaker, Wheat, MapPin } from "lucide-react";
import {
  soilHealthService,
  type SoilState,
  type SoilDistrict,
  type SoilCrop,
  type FertilizerRec,
} from "@/hooks/services/soilHealthService";

export function FertilizerCalculator() {
  const [states, setStates] = useState<SoilState[]>([]);
  const [districts, setDistricts] = useState<SoilDistrict[]>([]);
  const [crops, setCrops] = useState<SoilCrop[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [nValue, setNValue] = useState("");
  const [pValue, setPValue] = useState("");
  const [kValue, setKValue] = useState("");
  const [ocValue, setOCValue] = useState("");
  const [recommendations, setRecommendations] = useState<FertilizerRec[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStates, setLoadingStates] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    soilHealthService
      .getStates()
      .then(setStates)
      .catch(() => setError("Failed to load states"))
      .finally(() => setLoadingStates(false));
  }, []);

  useEffect(() => {
    if (!selectedState) {
      setDistricts([]);
      setCrops([]);
      return;
    }
    const state = states.find((s) => s.name === selectedState);
    if (!state) return;

    soilHealthService.getDistricts(state._id).then(setDistricts).catch(() => {});
    soilHealthService.getCrops(state._id).then(setCrops).catch(() => {});
  }, [selectedState, states]);

  const toggleCrop = (cropName: string) => {
    setSelectedCrops((prev) =>
      prev.includes(cropName) ? prev.filter((c) => c !== cropName) : [...prev, cropName]
    );
  };

  const handleCalculate = async () => {
    if (!selectedState || !nValue || !pValue || !kValue || !ocValue) {
      setError("Please fill all required fields");
      return;
    }
    setLoading(true);
    setError("");
    setRecommendations([]);

    try {
      const recs = await soilHealthService.getRecommendations({
        state: selectedState,
        n: parseFloat(nValue),
        p: parseFloat(pValue),
        k: parseFloat(kValue),
        oc: parseFloat(ocValue),
        district: selectedDistrict || undefined,
        crops: selectedCrops.length > 0 ? selectedCrops : undefined,
      });
      setRecommendations(recs);
    } catch (e: any) {
      setError(e.message || "Failed to get recommendations");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            Fertilizer Calculator
          </CardTitle>
          <CardDescription>
            Get crop-specific fertilizer dosage recommendations based on your soil test results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Select
                value={selectedState}
                onValueChange={setSelectedState}
                disabled={loadingStates}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingStates ? "Loading states..." : "Select state"} />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s._id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="district">District (Optional)</Label>
              <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                <SelectTrigger>
                  <SelectValue placeholder="Select district" />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((d) => (
                    <SelectItem key={d._id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {crops.length > 0 && (
            <div className="space-y-2">
              <Label>Select Crops (Optional - for specific recommendations)</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded">
                {crops.map((c) => (
                  <Badge
                    key={c._id}
                    variant={selectedCrops.includes(c.name) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleCrop(c.name)}
                  >
                    {c.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="n">Nitrogen (N) mg/kg *</Label>
              <Input
                id="n"
                type="number"
                value={nValue}
                onChange={(e) => setNValue(e.target.value)}
                placeholder="e.g., 200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p">Phosphorus (P) mg/kg *</Label>
              <Input
                id="p"
                type="number"
                value={pValue}
                onChange={(e) => setPValue(e.target.value)}
                placeholder="e.g., 30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k">Potassium (K) mg/kg *</Label>
              <Input
                id="k"
                type="number"
                value={kValue}
                onChange={(e) => setKValue(e.target.value)}
                placeholder="e.g., 150"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc">Organic Carbon (%) *</Label>
              <Input
                id="oc"
                type="number"
                step="0.1"
                value={ocValue}
                onChange={(e) => setOCValue(e.target.value)}
                placeholder="e.g., 0.5"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleCalculate} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Leaf className="mr-2 h-4 w-4" />}
            Get Recommendations
          </Button>
        </CardContent>
      </Card>

      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wheat className="h-5 w-5" />
              Fertilizer Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendations.map((rec, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <h3 className="font-semibold text-lg">{rec.crop}</h3>
                {rec.primary?.fertilizers && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Primary Recommendation:</p>
                    <div className="flex flex-wrap gap-2">
                      {rec.primary.fertilizers.map((f, j) => (
                        <Badge key={j} variant="secondary">
                          {f.name}: {f.dosage} {f.unit}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {rec.explanations && rec.explanations.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Why this recommendation?</p>
                    <ul className="text-sm space-y-1 list-disc list-inside text-foreground">
                      {rec.explanations.map((exp, j) => (
                        <li key={j}>{exp}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {rec.alternative?.fertilizers && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Alternative:</p>
                    <div className="flex flex-wrap gap-2">
                      {rec.alternative.fertilizers.map((f, j) => (
                        <Badge key={j} variant="outline">
                          {f.name}: {f.dosage} {f.unit}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
