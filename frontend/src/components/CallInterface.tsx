import { useState } from "react";
import { IncomingCallBox } from "./IncomingCallBox";
import { CallHistory } from "./CallHistory";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { toast } from "sonner";
import Plivo from 'plivo-browser-sdk';
import { Button } from "./atoms/button";
import { RotateCcw } from "lucide-react";

export const CallInterface = () => {
  const [editableTranscript, setEditableTranscript] = useState("");

  const handleResetTranscript = () => {
    // Clear transcript state
    setEditableTranscript("");
    // Notify parent component
    // onTranscriptChange?.('');
  };

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
    <div className="space-y-4">
      {/* Incoming Call Box - Top Section */}
      <IncomingCallBox
        onTranscriptChange={(transcript) => setEditableTranscript(transcript)}
      />

      {/* Live Transcript - Shows even after call ends */}
      {editableTranscript && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex justify-between">
              <span>Transcript</span>
              <Button
                onClick={handleResetTranscript}
                size="sm"
                variant="outline"
                className="flex items-center justify-end gap-1 h-6"
                title="Clear transcript"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset</span>
              </Button>
            </CardTitle>

          </CardHeader>
          <CardContent>
            <textarea
              value={editableTranscript}
              onChange={(e) => setEditableTranscript(e.target.value)}
              className="w-full min-h-[100px] max-h-[300px] p-4 text-sm rounded-lg border bg-muted/50 resize-y overflow-y-auto whitespace-pre-wrap"
              placeholder="Transcript will appear here..."
            />
          </CardContent>
        </Card>
      )}

      {/* Call History - Bottom Section */}
      <CallHistory onRedial={handleRedial} />
    </div>
  );
};

export default CallInterface;
