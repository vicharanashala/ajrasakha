import { useState } from "react";
import { IncomingCallBox } from "./IncomingCallBox";
import { CallHistory } from "./CallHistory";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { plivoApi } from "@/hooks/api/plivo/api";
import { toast } from "sonner";
import Plivo from 'plivo-browser-sdk';

export const CallInterface = () => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [callTranscript, setCallTranscript] = useState("");
    let plivoClientRef;



  const handleRedial = async (phoneNumber: string) => {
    //   const options = {
    //   debug: "DEBUG" as const,
    //   permOnClick: true,
    //   enableTracking: true
    // };

    // const client = new Plivo(options);
    // plivoClientRef = client;
    // try {
    //   const extraHeaders = {
    //     'X-PH-destination': "+919606751041"       // e.g. "+919606751041"
    //   };
    //   const result = plivoClientRef.client.call("+919606751041", extraHeaders);
    //   toast.success(`Redialing ${phoneNumber}. Call UUID: ${result}`);
    // } catch (error: any) {
    //   toast.error(error.message || "Failed to initiate call");
    // }
  };

  return (
    <div className="space-y-6">
      {/* Incoming Call Box - Top Section */}
      <IncomingCallBox
        onTranscriptUpdate={(transcript) => setCallTranscript(transcript)}
        onCallStateChange={(isActive) => setIsCallActive(isActive)}
      />

      {/* Live Transcript - Shows when call is active */}
      {isCallActive && callTranscript && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Live Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-muted/50 rounded-lg min-h-[100px] max-h-[300px] overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap">{callTranscript}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Call History - Bottom Section */}
      <CallHistory onRedial={handleRedial} />
    </div>
  );
};

export default CallInterface;
