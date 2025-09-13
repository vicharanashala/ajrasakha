interface Question {
  id: string;
  text: string;
  currentAnswers: string[];
}

const generateRandomAnswer = (base: string, index: number): string =>
  `${base} (randomized answer ${index})`;

export const generateQuestionDataSet = async (): Promise<Question[]> => {
  const baseQuestions: Question[] = [
    {
      id: "1",
      text: "What is your company's main product or service?",
      currentAnswers: [],
    },
    {
      id: "2",
      text: "How many employees does your company have?",
      currentAnswers: [],
    },
    {
      id: "3",
      text: "What is your target market?",
      currentAnswers: [],
    },
    {
      id: "4",
      text: "What are your main business challenges?",
      currentAnswers: [],
    },
    {
      id: "5",
      text: "What is your annual revenue range?",
      currentAnswers: [],
    },
  ];

  const hugeDataset: Question[] = [];

  for (let i = 0; i < 100; i++) {
    baseQuestions.forEach((q) => {
      const randomAnswerCount = Math.floor(Math.random() * 11) + 10; 
      const randomAnswers = Array.from(
        { length: randomAnswerCount },
        (_, idx) => generateRandomAnswer(q.text, idx)
      );

      const newQ: Question = {
        ...q,
        id: `${q.id}-${i}`,
        currentAnswers: randomAnswers,
      };

      hugeDataset.push(newQ);
    });
  }

  return hugeDataset;
};
