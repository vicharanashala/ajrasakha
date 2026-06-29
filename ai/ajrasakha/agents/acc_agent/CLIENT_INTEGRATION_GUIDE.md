# ACC Agent Client Integration Guide

This guide explains how to integrate the `acc_agent` (Agricultural Call Center Agent) into your frontend client using the LangGraph REST API. The `acc_agent` uses a **Human-in-the-Loop** architecture, which means the execution pauses halfway through to allow human call center agents to verify or edit the AI's data extraction before the final answer is generated.

## Prerequisites
- **Base API URL:** `http://100.100.108.44:2026`
- **Assistant ID:** `4d50728b-e84c-5ea2-b492-6b3f94ff0dc8` (the ID mapped to `acc_agent`)

---

## The 4-Step API Flow

### Step 1: Initialize a Session (Thread)
Every conversation requires a dedicated Thread ID to maintain state across the pause.

```javascript
const BASE_URL = "http://100.100.108.44:2026";
const ASSISTANT_ID = "4d50728b-e84c-5ea2-b492-6b3f94ff0dc8";

async function createThread() {
  const response = await fetch(`${BASE_URL}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const thread = await response.json();
  return thread.thread_id; 
}
```

### Step 2: Send the Transcript (Extraction Phase)
Send the raw call transcript to the API. The graph will run the extraction node and then **pause automatically** because of the `interrupt_after` breakpoint.

Using `/runs/wait` ensures the API holds the connection open until it hits the breakpoint, returning the extracted data instantly.

```javascript
async function extractData(threadId, transcriptText) {
  const response = await fetch(`${BASE_URL}/threads/${threadId}/runs/wait`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assistant_id: ASSISTANT_ID,
      input: {
        transcript: transcriptText
      }
    })
  });
  
  const runData = await response.json();
  
  // runData contains the extracted entities from the AI.
  // Use these to populate your frontend UI for the human agent to review:
  console.log("Query:", runData.extracted_query);
  console.log("Crop:", runData.extracted_crop);
  console.log("State:", runData.extracted_state);
  console.log("District:", runData.extracted_district);
}
```

### Step 3: Human Verification & State Override (If Edited)
Present the extracted variables to the human in a form. 

**Scenario A: The human clicks "Approve" without changes.**
You do not need to do anything. Proceed directly to Step 4.

**Scenario B: The human edits the fields.**
If the human corrects the AI's extraction (e.g., changes the query from weather to market price), you must update the thread's state *before* resuming.

```javascript
async function updateState(threadId, correctedData) {
  await fetch(`${BASE_URL}/threads/${threadId}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: {
        extracted_query: correctedData.query,
        extracted_crop: correctedData.crop,
        extracted_state: correctedData.state,
        extracted_district: correctedData.district
      }
    })
  });
}
```

### Step 4: Resume & Fetch Final Answer
Once the human has approved the data (and you've pushed updates if necessary), you must command the graph to resume. The graph will evaluate the approved state, route it to the correct backend tool (Weather, Market, GDB), and assemble the final answer.

```javascript
async function resumeAndGetAnswer(threadId) {
  const response = await fetch(`${BASE_URL}/threads/${threadId}/runs/wait`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assistant_id: ASSISTANT_ID,
      // The 'resume' command tells LangGraph to unpause
      command: { resume: null } 
    })
  });
  
  const finalRunData = await response.json();
  
  // Display the final answer to the human agent!
  console.log("Final Answer:", finalRunData.final_answer);
  return finalRunData.final_answer;
}
```

---

## Full End-to-End Example

```javascript
async function handleCallCenterRequest(transcript) {
  try {
    // 1. Setup
    const threadId = await createThread();
    
    // 2. Extract
    console.log("Extracting data...");
    await extractData(threadId, transcript);
    
    // 3. Human interaction happens here (UI pause)
    // Example: User modifies the query
    const humanCorrectedData = {
      query: "What is the mandi price of Sugarcane?",
      crop: "Sugarcane",
      state: "Maharashtra",
      district: "Pune"
    };
    
    console.log("Human corrected data, updating state...");
    await updateState(threadId, humanCorrectedData);
    
    // 4. Resume
    console.log("Resuming graph for final answer...");
    const answer = await resumeAndGetAnswer(threadId);
    
    console.log("Success! Answer:", answer);
    
  } catch (error) {
    console.error("API Error:", error);
  }
}
```
