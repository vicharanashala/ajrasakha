import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Filter,
  HelpCircle,
  Lightbulb,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  User,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import toast from "react-hot-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import type { SupportedLanguage } from "@/types";
import { useSubmitTranscript } from "@/hooks/api/context/useSubmitTranscript";
import { ScrollArea, ScrollBar } from "./atoms/scroll-area";
import { Label } from "./atoms/label";
import { useGenerateQuestion } from "@/hooks/api/question/useGenerateQuestion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { Skeleton } from "./atoms/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";

export interface GeneratedQuestion {
  id: string;
  question: string;
  agri_specialist: string;
  answer: string;
}
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

const supportedLanguages: { code: SupportedLanguage; label: string }[] = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "te-IN", label: "Telugu" },
  { code: "mr-IN", label: "Marathi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ur-IN", label: "Urdu" },
];

const VoiceRecorderCard = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState(`Livestock production systems
Main articles: Livestock and Animal husbandry
See also: List of domesticated animals

Intensively farmed pigs
Animal husbandry is the breeding and raising of animals for meat, milk, eggs, or wool, and for work and transport.[146] Working animals, including horses, mules, oxen, water buffalo, camels, llamas, alpacas, donkeys, and dogs, have for centuries been used to help cultivate fields, harvest crops, wrangle other animals, and transport farm products to buyers.[147]

Livestock production systems can be defined based on feed source, as grassland-based, mixed, and landless.[148] As of 2010, 30% of Earth's ice- and water-free area was used for producing livestock, with the sector employing approximately 1.3 billion people. Between the 1960s and the 2000s, there was a significant increase in livestock production, both by numbers and by carcass weight, especially among beef, pigs and chickens, the latter of which had production increased by almost a factor of 10. Non-meat animals, such as milk cows and egg-producing chickens, also showed significant production increases. Global cattle, sheep and goat populations are expected to continue to increase sharply through 2050.[149] Aquaculture or fish farming, the production of fish for human consumption in confined operations, is one of the fastest growing sectors of food production, growing at an average of 9% a year between 1975 and 2007.[150]

During the second half of the 20th century, producers using selective breeding focused on creating livestock breeds and crossbreeds that increased production, while mostly disregarding the need to preserve genetic diversity. This trend has led to a significant decrease in genetic diversity and resources among livestock breeds, leading to a corresponding decrease in disease resistance and local adaptations previously found among traditional breeds.[151]


Raising chickens intensively for meat in a broiler house
Grassland based livestock production relies upon plant material such as shrubland, rangeland, and pastures for feeding ruminant animals. Outside nutrient inputs may be used, however manure is returned directly to the grassland as a major nutrient source. This system is particularly important in areas where crop production is not feasible because of climate or soil, representing 30–40 million pastoralists.[143] Mixed production systems use grassland, fodder crops and grain feed crops as feed for ruminant and monogastric (one stomach; mainly chickens and pigs) livestock. Manure is typically recycled in mixed systems as a fertilizer for crops.[148]

Landless systems rely upon feed from outside the farm, representing the de-linking of crop and livestock production found more prevalently in Organization for Economic Co-operation and Development member countries. Synthetic fertilizers are more heavily relied upon for crop production and manure use becomes a challenge as well as a source for pollution.[148] Industrialized countries use these operations to produce much of the global supplies of poultry and pork. Scientists estimate that 75% of the growth in livestock production between 2003 and 2030 will be in confined animal feeding operations, sometimes called factory farming. Much of this growth is happening in developing countries in Asia, with much smaller amounts of growth in Africa.[149] Some of the practices used in commercial livestock production, including the usage of growth hormones, are controversial.[152]

Production practices

Tilling an arable field
Further information: Tillage, Crop rotation, and Irrigation
Tillage is the practice of breaking up the soil with tools such as the plow or harrow to prepare for planting, for nutrient incorporation, or for pest control. Tillage varies in intensity from conventional to no-till. It can improve productivity by warming the soil, incorporating fertilizer and controlling weeds, but also renders soil more prone to erosion, triggers the decomposition of organic matter releasing CO2, and reduces the abundance and diversity of soil organisms.[153][154]

Pest control includes the management of weeds, insects, mites, and diseases. Chemical (pesticides), biological (biocontrol), mechanical (tillage), and cultural practices are used. Cultural practices include crop rotation, culling, cover crops, intercropping, composting, avoidance, and resistance. Integrated pest management attempts to use all of these methods to keep pest populations below the number which would cause economic loss, and recommends pesticides as a last resort.[155]

Nutrient management includes both the source of nutrient inputs for crop and livestock production, and the method of use of manure produced by livestock. Nutrient inputs can be chemical inorganic fertilizers, manure, green manure, compost and minerals.[156] Crop nutrient use may also be managed using cultural techniques such as crop rotation or a fallow period. Manure is used either by holding livestock where the feed crop is growing, such as in managed intensive rotational grazing, or by spreading either dry or liquid formulations of manure on cropland or pastures.[153][157]

Water management is needed where rainfall is insufficient or variable, which occurs to some degree in most regions of the world.[143] Some farmers use irrigation to supplement rainfall. In other areas such as the Great Plains in the U.S. and Canada, farmers use a fallow year to conserve soil moisture for the following year.[158] Recent technological innovations in precision agriculture allow for water status monitoring and automate water usage, leading to more efficient management.[159] Agriculture represents 70% of freshwater use worldwide.[160] However, water withdrawal ratios for agriculture vary significantly by income level. In least developed countries and landlocked developing countries, water withdrawal ratios for agriculture are as high as 90 percent of total water withdrawals and about 60 percent in Small Island Developing States.[161]

According to 2014 report by the International Food Policy Research Institute, agricultural technologies will have the greatest impact on food production if adopted in combination with each other. Using a model that assessed how eleven technologies could impact agricultural productivity, food security and trade by 2050, the International Food Policy Research Institute found that the number of people at risk from hunger could be reduced by as much as 40% and food prices could be reduced by almost half.[162]

Payment for ecosystem services is a method of providing additional incentives to encourage farmers to conserve some aspects of the environment. Measures might include paying for reforestation upstream of a city, to improve the supply of fresh water.[163]

Agricultural automation
Different definitions exist for agricultural automation and for the variety of tools and technologies that are used to automate production. One view is that agricultural automation refers to autonomous navigation by robots without human intervention.[164] Alternatively, it is defined as the accomplishment of production tasks through mobile, autonomous, decision-making, mechatronic devices.[165] However, FAO finds that these definitions do not capture all the aspects and forms of automation, such as robotic milking machines that are static, most motorized machinery that automates the performing of agricultural operations, and digital tools (e.g., sensors) that automate only diagnosis.[159] FAO defines agricultural automation as the use of machinery and equipment in agricultural operations to improve their diagnosis, decision-making or performing, reducing the drudgery of agricultural work or improving the timeliness, and potentially the precision, of agricultural operations.[166]

The technological evolution in agriculture has involved a progressive move from manual tools to animal traction, to motorized mechanization, to digital equipment and finally, to robotics with artificial intelligence (AI).[166] Motorized mechanization using engine power automates the performance of agricultural operations such as ploughing and milking.[167] With digital automation technologies, it also becomes possible to automate diagnosis and decision-making of agricultural operations.[166] For example, autonomous crop robots can harvest and seed crops, while drones can gather information to help automate input application.[159] Precision agriculture often employs such automation technologies.[159] Motorized machines are increasingly complemented, or even superseded, by new digital equipment that automates diagnosis and decision-making.[167] A conventional tractor, for example, can be converted into an automated vehicle allowing it to sow a field autonomously.[167]

Motorized mechanization has increased significantly across the world in recent years, although reliable global data with broad country coverage exist only for tractors and only up to 2009.[168] Sub-Saharan Africa is the only region where the adoption of motorized mechanization has stalled over the past decades.[159][169]

Automation technologies are increasingly used for managing livestock, though evidence on adoption is lacking. Global automatic milking system sales have increased over recent years, but adoption is likely mostly in Northern Europe,[170] and likely almost absent in low- and middle-income countries. Automated feeding machines for both cows and poultry also exist, but data and evidence regarding their adoption trends and drivers is likewise scarce.[171][159]

Measuring the overall employment impacts of agricultural automation is difficult because it requires large amounts of data tracking all the transformations and the associated reallocation of workers both upstream and downstream.[166] While automation technologies reduce labor needs for the newly automated tasks, they also generate new labor demand for other tasks, such as equipment maintenance and operation.[159] Agricultural automation can also stimulate employment by allowing producers to expand production and by creating other agrifood systems jobs.[172] This is especially true when it happens in context of rising scarcity of rural labor, as is the case in high-income countries and many middle-income countries.[172] On the other hand, if forcedly promoted, for example through government subsidies in contexts of abundant rural labor, it can lead to labor displacement and falling or stagnant wages, particularly affecting poor and low-skilled workers.[172]

Effects of climate change on yields
Main article: Effects of climate change on agriculture

The sixth IPCC Assessment Report projects changes in average soil moisture at 2.0 °C of warming, as measured in standard deviations from the 1850 to 1900 baseline.
Climate change and agriculture are interrelated on a global scale. Climate change affects agriculture through changes in average temperatures, rainfall, and weather extremes (like storms and heat waves); changes in pests and diseases; changes in atmospheric carbon dioxide and ground-level ozone concentrations; changes in the nutritional quality of some foods;[173] and changes in sea level.[174] Global warming is already affecting agriculture, with effects unevenly distributed across the world.[175]

In a 2022 report, the Intergovernmental Panel on Climate Change describes how human-induced warming has slowed growth of agricultural productivity over the past 50 years in mid and low latitudes.[176] Methane emissions have negatively impacted crop yields by increasing temperatures and surface ozone concentrations.[176] Warming is also negatively affecting crop and grassland quality and harvest stability.[176] Ocean warming has decreased sustainable yields of some wild fish populations while ocean acidification and warming have already affected farmed aquatic species.[176] Climate change will probably increase the risk of food insecurity for some vulnerable groups, such as the poor.[177]

Crop alteration and biotechnology
Plant breeding
Main article: Plant breeding

Wheat cultivar tolerant of high salinity (left) compared with non-tolerant variety
Crop alteration has been practiced by humankind for thousands of years, since the beginning of civilization. Altering crops through breeding practices changes the genetic make-up of a plant to develop crops with more beneficial characteristics for humans, for example, larger fruits or seeds, drought-tolerance, or resistance to pests. Significant advances in plant breeding ensued after the work of geneticist Gregor Mendel. His work on dominant and recessive alleles, although initially largely ignored for almost 50 years, gave plant breeders a better understanding of genetics and breeding techniques. Crop breeding includes techniques such as plant selection with desirable traits, self-pollination and cross-pollination, and molecular techniques that genetically modify the organism.[178]

Domestication of plants has, over the centuries increased yield, improved disease resistance and drought tolerance, eased harvest and improved the taste and nutritional value of crop plants. Careful selection and breeding have had enormous effects on the characteristics of crop plants. Plant selection and breeding in the 1920s and 1930s improved pasture (grasses and clover) in New Zealand. Extensive X-ray and ultraviolet induced mutagenesis efforts (i.e. primitive genetic engineering) during the 1950s produced the modern commercial varieties of grains such as wheat, corn (maize) and barley.[179][180]


Seedlings in a green house. This is what it looks like when seedlings are growing from plant breeding.
The Green Revolution popularized the use of conventional hybridization to sharply increase yield by creating "high-yielding varieties". For example, average yields of corn (maize) in the US have increased from around 2.5 tons per hectare (t/ha) (40 bushels per acre) in 1900 to about 9.4 t/ha (150 bushels per acre) in 2001. Similarly, worldwide average wheat yields have increased from less than 1 t/ha in 19`);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("en-IN");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const [frequencyData, setFrequencyData] = useState<number[]>([]);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const lastTranscriptRef = useRef<string>(""); // to hold the previous trnascript to avoid duplicate api calls
  const frequencyRef = useRef<number[]>([]);

  const { mutateAsync: submitTranscript, isPending } = useSubmitTranscript();

  const { mutateAsync: generateQuestions, isPending: isGeneratingQuestions } =
    useGenerateQuestion();

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            setTranscript((prev) => prev + " " + result[0].transcript);
          } else {
            interim += result[0].transcript;
          }
        }
        setInterimTranscript(interim);
      };

      recognition.onend = () => {
        // setIsListening(false);
        // setIsRecording(false);
        const IS_FROM_ONEND = true;
        handleRecordingToggle(IS_FROM_ONEND);
      };
      recognition.onerror = (event: any) => console.error(event.error);

      recognitionRef.current = recognition;
    } else {
      toast.error("Web Speech API is not supported in this browser.");
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [language]);

  const displayTranscript =
    transcript + (interimTranscript ? " " + interimTranscript : "");

  useEffect(() => {
    transcriptRef.current = displayTranscript;
    frequencyRef.current = frequencyData;
  }, [frequencyData]);

  useEffect(() => {
    if (!isRecording || !isListening) return;

    const interval = setInterval(async () => {
      const currentTranscript = transcriptRef.current.trim();

      const maxFrequency = Math.max(...frequencyRef.current);

      if (transcriptRef.current.length <= 10 || maxFrequency < 0.05) return;
      // if (currentTranscript.length <= 10) return;
      if (currentTranscript === lastTranscriptRef.current) return;

      lastTranscriptRef.current = currentTranscript;

      try {
        const qstns = await generateQuestions(transcriptRef.current);
        // setQuestions((prev) => (qstns ? [...prev, ...qstns] : prev));
        setQuestions(() => (qstns ? qstns : []));
      } catch (err) {
        console.error("Error generating questions:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isRecording, generateQuestions]);

  const handleRecordingToggle = async (isFromOnEnd?: boolean) => {
    if (isRecording || isFromOnEnd) {
      setIsRecording(false);
      setIsListening(false);

      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
      }

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        source.connect(analyserRef.current);

        updateAudioLevel();

        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.start();

        if (recognitionRef.current) {
          recognitionRef.current.start();
        }

        setIsRecording(true);
        setIsListening(true);
        setInterimTranscript("");
      } catch (error) {
        console.error("Error accessing microphone:", error);
      }
    }
  };

  const updateAudioLevel = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);

      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);

      const frequencyBars = Array.from(dataArray.slice(0, 16)).map(
        (value) => value / 255
      );
      setFrequencyData(frequencyBars);
    }
  };

  const handleSubmit = async () => {
    if (!transcript.trim()) {
      toast.error("Transcript is empty!");
      return;
    }

    try {
      await submitTranscript(transcript);
      setTranscript("");
      setInterimTranscript("");
      toast.success("Transcript submitted successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit transcript. Try again!");
    }
  };

  const handleClear = () => {
    setTranscript("");
    setIsRecording(false);
    setIsListening(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }
    setQuestions([]);
  };

  return (
    <div className="min-h-[75%] bg-background p-4 ">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="min-h-[80%] md:min-h-[75%] md:max-h-[75%]">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Volume2 className="h-4 w-4" />
                  Voice Recorder
                </CardTitle>

                <Select
                  value={language}
                  onValueChange={(value) =>
                    setLanguage(value as SupportedLanguage)
                  }
                  disabled={isRecording || isListening}
                >
                  <SelectTrigger className="w-full md:w-[160px] h-9">
                    <Filter className="w-4 h-4 md:hidden" />
                    <span className="hidden md:block text-sm">
                      <SelectValue placeholder="Language" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 border rounded-lg bg-muted/30">
                <Button
                  onClick={() => handleRecordingToggle()}
                  size="sm"
                  variant={isRecording ? "destructive" : "default"}
                  className={cn(
                    "h-12 w-12 rounded-full flex-shrink-0 self-center sm:self-auto",
                    isRecording && "animate-pulse"
                  )}
                >
                  {isRecording ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>

                <div className="flex-1 flex items-center gap-1 h-8">
                  {isRecording && isListening ? (
                    frequencyData.map((level, index) => (
                      <div
                        key={index}
                        className="bg-gradient-to-t from-blue-500 to-purple-500 rounded-full w-1 transition-all duration-75"
                        style={{
                          height: `${Math.max(level * 100, 10)}%`,
                          opacity: 0.6 + level * 0.4,
                        }}
                      />
                    ))
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      {isRecording ? (
                        <>
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                          Recording...
                        </>
                      ) : (
                        "Click microphone to start"
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {transcript && !isRecording && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">Done</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Transcript</Label>
                  {displayTranscript.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {displayTranscript.length} chars
                    </span>
                  )}
                </div>

                <div className="h-40 relative">
                  <div className="h-full w-full overflow-y-auto rounded-md border bg-background/50 p-3 text-sm whitespace-pre-wrap break-words">
                    {displayTranscript || (
                      <span className="text-muted-foreground">
                        Your speech will appear here...
                      </span>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-wrap justify-end mt-2 gap-2">
                  <Button
                    onClick={handleClear}
                    variant="outline"
                    size="sm"
                    disabled={!displayTranscript || isRecording}
                    className="flex items-center gap-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Clear</span>
                  </Button>

                  <Button
                    onClick={handleSubmit}
                    disabled={!displayTranscript || isPending || isRecording}
                    size="sm"
                    className="flex items-center gap-1 shadow-sm"
                  >
                    <Send className="h-3 w-3" />
                    <span className="text-xs">
                      {isPending ? "Sending..." : "Submit"}
                    </span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[80%]  md:min-h-[75%] md:max-h-[75%]">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-2">
                      <HelpCircle className="h-5 w-5" />
                      Questions
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    These are questions generated from your transcript
                  </TooltipContent>
                </Tooltip>
                <Badge variant="outline">{questions?.length} questions</Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className=" h-full overflow-hidden">
              {isGeneratingQuestions ? (
                <div className="flex flex-col h-[500px] text-center text-muted-foreground space-y-4 p-4">
                  <Skeleton className="h-25 w-full rounded-md" />
                  <Skeleton className="h-25 w-full rounded-md" />
                  <Skeleton className="h-25 w-full rounded-md" />
                </div>
              ) : (
                <ScrollArea className="h-[500px] w-full ">
                  {!questions || questions?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
                      <Lightbulb className="h-12 w-12 mb-4 opacity-50" />
                      <p className="text-sm">
                        Start speaking to related questions based on your
                        transcript
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-28">
                      {questions?.map((qn, index) => (
                        <div
                          key={`${qn.question}-${qn.id + index}`}
                          className="rounded-lg border bg-card hover:bg-accent/30 transition-colors overflow-hidden"
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <div className="text-blue-600 dark:text-blue-400 mt-1">
                                <HelpCircle className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground leading-relaxed">
                                  {qn.question}
                                </p>
                              </div>
                            </div>

                            <Accordion
                              type="single"
                              collapsible
                              className="w-full"
                            >
                              <AccordionItem
                                value="answer"
                                className="border-none"
                              >
                                <AccordionTrigger className="py-2 px-3 bg-muted/50 rounded-md hover:bg-muted transition-colors text-sm font-medium hover:no-underline">
                                  <div className="flex items-center gap-2">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    View Expert Answer
                                  </div>
                                </AccordionTrigger>

                                <AccordionContent className="pt-3 pb-1">
                                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
                                    <div className="flex justify-between items-center w-full px-2">
                                      <div className="flex items-center gap-2">
                                        <svg
                                          className="w-4 h-4 text-green-600 dark:text-green-400"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                          />
                                        </svg>
                                        <span className="text-sm font-medium text-green-800 dark:text-green-200">
                                          Specialist Answer
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <User className="w-3 h-3" />
                                        <span className="font-medium">
                                          Specialist:
                                        </span>
                                        <span className="font-medium text-foreground">
                                          {qn.agri_specialist}
                                        </span>
                                      </div>
                                    </div>

                                    <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed px-2">
                                      {qn.answer || "Nil"}
                                    </p>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              )}

              {(questions?.length || 0) > 0 && (
                <div className="text-center text-sm text-muted-foreground border-t pt-4 mt-4">
                  <p>Questions are generated live as you speak</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VoiceRecorderCard;
