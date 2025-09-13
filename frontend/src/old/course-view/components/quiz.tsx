// import * as React from "react";
// import { useState } from "react";
// import { faker } from "@faker-js/faker";
// import {
//   Card,
//   CardContent,
//   CardHeader,
//   CardTitle,
//   CardDescription,
// } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import { cn } from "@/lib/utils";
// import { RadioGroupItem } from "@/components/ui/radio-group";
// import { RadioGroup } from "@radix-ui/react-dropdown-menu";
// import { Checkbox } from "@/components/ui/checkbox";
// import { Button } from "@/components/ui/button";

// /* ----------------------------------------------------------------------------
//  * 𝟙  Types (mirrors the backend contracts, simplified for client)
//  * --------------------------------------------------------------------------*/
// export type QuestionType =
//   | "SELECT_ONE_IN_LOT"
//   | "SELECT_MANY_IN_LOT"
//   | "ORDER_THE_LOTS"
//   | "NUMERIC_ANSWER_TYPE"
//   | "DESCRIPTIVE";

// type LotItem = {
//   lotItemId: string;
//   text: string;
// };

// export interface BaseQuestion {
//   questionId: string;
//   prompt: string;
//   questionType: QuestionType;
// }

// export interface SOLQuestion extends BaseQuestion {
//   questionType: "SELECT_ONE_IN_LOT";
//   lotItems: LotItem[];
// }
// export interface SMLQuestion extends BaseQuestion {
//   questionType: "SELECT_MANY_IN_LOT";
//   lotItems: LotItem[];
// }
// export interface OTLQuestion extends BaseQuestion {
//   questionType: "ORDER_THE_LOTS";
//   lotItems: LotItem[];
// }
// export interface NATQuestion extends BaseQuestion {
//   questionType: "NUMERIC_ANSWER_TYPE";
//   decimalPrecision: number;
// }
// export interface DESQuestion extends BaseQuestion {
//   questionType: "DESCRIPTIVE";
// }

// export type AnyQuestion =
//   | SOLQuestion
//   | SMLQuestion
//   | OTLQuestion
//   | NATQuestion
//   | DESQuestion;

// /* ----------------------------------------------------------------------------
//  * 𝟚  Offline generator (10 Qs)
//  * --------------------------------------------------------------------------*/
// export function generateOfflineQuiz(count = 10): AnyQuestion[] {
//   return Array.from({ length: count }).map<AnyQuestion>((_, idx) => {
//     const type = faker.helpers.arrayElement<AnyQuestion["questionType"]>([
//       "SELECT_ONE_IN_LOT",
//       "SELECT_MANY_IN_LOT",
//       "ORDER_THE_LOTS",
//       "NUMERIC_ANSWER_TYPE",
//       "DESCRIPTIVE",
//     ]);
//     const base: BaseQuestion = {
//       questionId: faker.string.nanoid(),
//       prompt: faker.lorem.sentence(),
//       questionType: type,
//     } as BaseQuestion;

//     switch (type) {
//       case "SELECT_ONE_IN_LOT":
//         return {
//           ...base,
//           lotItems: Array.from({ length: 4 }).map(() => ({
//             lotItemId: faker.string.nanoid(),
//             text: faker.commerce.productName(),
//           })),
//         } as SOLQuestion;
//       case "SELECT_MANY_IN_LOT":
//         return {
//           ...base,
//           lotItems: Array.from({ length: 5 }).map(() => ({
//             lotItemId: faker.string.nanoid(),
//             text: faker.commerce.productName(),
//           })),
//         } as SMLQuestion;
//       case "ORDER_THE_LOTS":
//         return {
//           ...base,
//           lotItems: Array.from({ length: 6 }).map(() => ({
//             lotItemId: faker.string.nanoid(),
//             text: faker.hacker.noun(),
//           })),
//         } as OTLQuestion;
//       case "NUMERIC_ANSWER_TYPE":
//         return {
//           ...base,
//           decimalPrecision: 2,
//         } as NATQuestion;
//       case "DESCRIPTIVE":
//         return base as DESQuestion;
//     }
//   });
// }

// /* ----------------------------------------------------------------------------
//  * 𝟛  Per‑type answer state shapes
//  * --------------------------------------------------------------------------*/
// interface AnswersMap {
//   [qId: string]:
//     | { type: "SELECT_ONE_IN_LOT"; lotItemId: string | null }
//     | { type: "SELECT_MANY_IN_LOT"; lotItemIds: string[] }
//     | { type: "ORDER_THE_LOTS"; lotItemIds: string[] }
//     | { type: "NUMERIC_ANSWER_TYPE"; value: string }
//     | { type: "DESCRIPTIVE"; text: string };
// }

// /* ----------------------------------------------------------------------------
//  * 𝟜  UI components per question type
//  * --------------------------------------------------------------------------*/
// const SOLRenderer: React.FC<{
//   q: SOLQuestion;
//   answer: AnswersMap[string];
//   setAnswer: (a: AnswersMap[string]) => void;
// }> = ({ q, answer, setAnswer }) => {
//   return (
//     <RadioGroup
//       onValueChange={(val) =>
//         setAnswer({ type: "SELECT_ONE_IN_LOT", lotItemId: val })
//       }
//       value={(answer as any)?.lotItemId ?? ""}
//       className="grid gap-2"
//     >
//       {q.lotItems.map((item) => (
//         <div key={item.lotItemId} className="flex items-center gap-2 p-2 border rounded-md">
//           <RadioGroupItem value={item.lotItemId} id={item.lotItemId} />
//           <label htmlFor={item.lotItemId} className="truncate">
//             {item.text}
//           </label>
//         </div>
//       ))}
//     </RadioGroup>
//   );
// };

// const SMLRenderer: React.FC<{
//   q: SMLQuestion;
//   answer: AnswersMap[string];
//   setAnswer: (a: AnswersMap[string]) => void;
// }> = ({ q, answer, setAnswer }) => {
//   const sel = new Set((answer as any)?.lotItemIds ?? []);
//   const toggle = (id: string) => {
//     const next = new Set(sel);
//     sel.has(id) ? next.delete(id) : next.add(id);
//     setAnswer({ type: "SELECT_MANY_IN_LOT", lotItemIds: Array.from(next) });
//   };
//   return (
//     <div className="grid gap-2">
//       {q.lotItems.map((item) => {
//         const checked = sel.has(item.lotItemId);
//         return (
//           <div
//             key={item.lotItemId}
//             className={cn(
//               "flex items-center gap-2 p-2 border rounded-md cursor-pointer select-none",
//               checked && "bg-muted"
//             )}
//             onClick={() => toggle(item.lotItemId)}
//           >
//             <Checkbox checked={checked} readOnly />
//             <span className="truncate">{item.text}</span>
//           </div>
//         );
//       })}
//     </div>
//   );
// };

// const OTLRenderer: React.FC<{
//   q: OTLQuestion;
//   answer: AnswersMap[string];
//   setAnswer: (a: AnswersMap[string]) => void;
// }> = ({ q, answer, setAnswer }) => {
//   // very simple drag‑less reordering (move up/down buttons)
//   const list = React.useMemo(
//     () => (answer as any)?.lotItemIds ?? q.lotItems.map((l) => l.lotItemId),
//     [answer, q.lotItems]
//   );
//   const move = (idx: number, dir: -1 | 1) => {
//     const arr = [...list];
//     const tgt = idx + dir;
//     if (tgt < 0 || tgt >= arr.length) return;
//     [arr[idx], arr[tgt]] = [arr[tgt], arr[idx]];
//     setAnswer({ type: "ORDER_THE_LOTS", lotItemIds: arr });
//   };
//   return (
//     <div className="grid gap-2">
//       {list.map((id, idx) => {
//         const item = q.lotItems.find((l) => l.lotItemId === id)!;
//         return (
//           <div
//             key={id}
//             className="flex items-center justify-between p-2 border rounded-md"
//           >
//             <span className="truncate flex-1 mr-2">{item.text}</span>
//             <div className="flex gap-1">
//               <Button variant="ghost" size="icon" onClick={() => move(idx, -1)}>
//                 ↑
//               </Button>
//               <Button variant="ghost" size="icon" onClick={() => move(idx, 1)}>
//                 ↓
//               </Button>
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// };

// const NATRenderer: React.FC<{
//   q: NATQuestion;
//   answer: AnswersMap[string];
//   setAnswer: (a: AnswersMap[string]) => void;
// }> = ({ q, answer, setAnswer }) => {
//   return (
//     <Input
//       type="number"
//       step={1 / Math.pow(10, q.decimalPrecision)}
//       value={(answer as any)?.value ?? ""}
//       onChange={(e) =>
//         setAnswer({ type: "NUMERIC_ANSWER_TYPE", value: e.target.value })
//       }
//     />
//   );
// };

// const DESRenderer: React.FC<{
//   q: DESQuestion;
//   answer: AnswersMap[string];
//   setAnswer: (a: AnswersMap[string]) => void;
// }> = ({ answer, setAnswer }) => (
//   <Textarea
//     rows={4}
//     value={(answer as any)?.text ?? ""}
//     onChange={(e) =>
//       setAnswer({ type: "DESCRIPTIVE", text: e.target.value })
//     }
//   />
// );

// /* ----------------------------------------------------------------------------
//  * 𝟝  Main Quiz component
//  * --------------------------------------------------------------------------*/
// interface QuizProps {
//   questions?: AnyQuestion[];
// }

// export const Quiz: React.FC<QuizProps> = ({ questions = generateOfflineQuiz() }) => {
//   const [answers, setAnswers] = useState<AnswersMap>({});
//   const [activeIdx, setActiveIdx] = useState(0);
//   const q = questions[activeIdx];

//   const setForId = (id: string) => (ans: AnswersMap[string]) =>
//     setAnswers((prev) => ({ ...prev, [id]: ans }));

//   const renderQuestion = () => {
//     const ans = answers[q.questionId];
//     switch (q.questionType) {
//       case "SELECT_ONE_IN_LOT":
//         return <SOLRenderer q={q} answer={ans} setAnswer={setForId(q.questionId)} />;
//       case "SELECT_MANY_IN_LOT":
//         return <SMLRenderer q={q} answer={ans} setAnswer={setForId(q.questionId)} />;
//       case "ORDER_THE_LOTS":
//         return <OTLRenderer q={q} answer={ans} setAnswer={setForId(q.questionId)} />;
//       case "NUMERIC_ANSWER_TYPE":
//         return <NATRenderer q={q} answer={ans} setAnswer={setForId(q.questionId)} />;
//       case "DESCRIPTIVE":
//         return <DESRenderer q={q} answer={ans} setAnswer={setForId(q.questionId)} />;
//     }
//   };

//   const next = () => setActiveIdx((i) => Math.min(i + 1, questions.length - 1));
//   const prev = () => setActiveIdx((i) => Math.max(i - 1, 0));

//   return (
//     <Card className="w-full max-w-2xl mx-auto">
//       <CardHeader>
//         <CardTitle>
//           Q{activeIdx + 1}/{questions.length}
//         </CardTitle>
//         <CardDescription className="whitespace-pre-line">
//           {q.prompt}
//         </CardDescription>
//       </CardHeader>
//       <CardContent className="grid gap-4">
//         {renderQuestion()}
//         <div className="flex justify-between pt-4">
//           <Button variant="secondary" onClick={prev} disabled={activeIdx === 0}>
//             Previous
//           </Button>
//           {activeIdx < questions.length - 1 ? (
//             <Button onClick={next}>Next</Button>
//           ) : (
//             <Button onClick={() => console.log(answers)}>Submit</Button>
//           )}
//         </div>
//       </CardContent>
//     </Card>
//   );
// };
