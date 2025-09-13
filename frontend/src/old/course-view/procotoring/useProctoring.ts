// src/proctoring/useProctoring.ts
import { useRef, useState, useEffect } from "react";
import startFaceDetection from "./detectors/startFaceDetection";
import runBlurDetector from "./detectors/runBlurDetector";
import runGestureDetector from "./detectors/runGestureDetector";
import runSpeechDetector from "./detectors/runSpeechDetector";
import isLookingAway from "./utils/isLookingAway";
import runGestureBurstDetector from "./detectors/runGestureDetector";

export interface ProctoringState {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    faces: number;
    isBlur: boolean;
    isSpeaking: boolean;
    gesture: string;
    isFocused: boolean;
    penalty: number;
    anomalies: boolean;
}

export default function useProctoring(): ProctoringState {
    const videoRef = useRef<HTMLVideoElement>(null);

    const [faces, setFaces] = useState(0);
    const [isFocused, setIsFocused] = useState(true);
    const [isBlur, setIsBlur] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [gesture, setGesture] = useState("No Gesture Detected ❌");
    const [penalty, setPenalty] = useState(0);

    /* ─────────────── detectors wiring ─────────────── */
    useEffect(() => {
        if (!videoRef.current) return; // wait until <video> is mounted

        const cleanups: (() => void)[] = [];

        /* Face detection + focus */
        cleanups.push(
            startFaceDetection(videoRef, (facesArr) => {
                setFaces(facesArr.length);
                setIsFocused(!isLookingAway(facesArr[0]));
            })
        );

        /* Blur */
        cleanups.push(runBlurDetector(videoRef, (b) => setIsBlur(b)));

        // /* Gesture (async init) */
        // runGestureBurstDetector(videoRef.current, {
        //     expectedGesture: "Open_Palm",
        //     activeDurationMs: 5_000,   // detector awake for 5 s
        //     idleDurationMs: 25_000,   // then sleeps 25 s
        //     onUpdate: setGesture,
        //     onSuccess: () => console.log("✅ gesture OK"),
        //     onFail: () => console.log("❌ no gesture shown"),
        // }).then(cleanups.push);

        /* Speech (async init) */
        runSpeechDetector((s) => setIsSpeaking(s)).then(cleanups.push);

        return () => cleanups.forEach((fn) => fn());
    }, []);

    /* ─────────────── penalty bookkeeping ─────────────── */
    useEffect(() => {
        let p = 0;
        if (isSpeaking) p++;
        if (isBlur) p++;
        if (faces !== 1) p++;
        if (!isFocused) p++;
        if (p) setPenalty((prev) => prev + p);
    }, [isSpeaking, isBlur, faces, isFocused]);

    return {
        videoRef,
        faces,
        isBlur,
        isSpeaking,
        gesture,
        isFocused,
        penalty,
        anomalies: isSpeaking || isBlur || faces !== 1 || !isFocused,
    };
}
