import { injectable } from 'inversify';
import { appConfig } from '../../../config/app.js';
// import * as fs from 'fs';
// import * as path from 'path';


interface SarvamTranscribeResponse {
  transcript: string;
  translated_text?: string;
  confidence?: number;
  language?: string;
  language_code?: string;
}

interface WhisperTranscribeResponse {
  text: string;
  usage?: {
    type: string;
    input_tokens: number;
    input_token_details?: {
      text_tokens: number;
      audio_tokens: number;
    };
    output_tokens: number;
    total_tokens: number;
  };
}

@injectable()
export class PlivoService {
  private sarvamApiKey: string;
  private activeTranscriptions: Map<string, string> = new Map();
  private activeTranslations: Map<string, string> = new Map(); // Store English translations
  private detectedLanguages: Map<string, string> = new Map(); // Store detected languages
  private audioBuffers: Map<string, Buffer[]> = new Map(); // Store audio chunks
  private readonly CHUNK_DURATION_MS = 5000; // 5 seconds of audio
  private readonly SAMPLE_RATE = 16000; // 16kHz Linear PCM
  private readonly CHUNK_SIZE = (this.SAMPLE_RATE * 2 * this.CHUNK_DURATION_MS) / 1000; // 160,000 bytes for 5 seconds (16-bit samples)
  // private readonly DEBUG_AUDIO_DIR = path.join(process.cwd(), 'debug_audio');

  constructor() {
    this.sarvamApiKey = appConfig.sarvamAPI;
    this.ensureDebugDir();
  }

  private ensureDebugDir(): void {
    // if (!fs.existsSync(this.DEBUG_AUDIO_DIR)) {
    //   fs.mkdirSync(this.DEBUG_AUDIO_DIR, { recursive: true });
    //   console.log(`📁 [PLIVO-SERVICE] Created debug audio directory: ${this.DEBUG_AUDIO_DIR}`);
    // }
  }
  /**
   * Convert 16kHz Linear PCM buffer to WAV format
   */
  private convertLinearPcmToWav(pcmBuffer: Buffer): Buffer {
    // console.log(`🔄 [PLIVO-SERVICE] Converting ${pcmBuffer.length} bytes of PCM to WAV`);
    
    // // Log first few raw bytes to check format
    // const firstBytes = Array.from(pcmBuffer.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    // console.log(`🔍 [PLIVO-SERVICE] First 20 bytes (hex): ${firstBytes}`);
    
    // // Check if it looks like 16-bit or 8-bit
    // console.log(`🔍 [PLIVO-SERVICE] Assuming 16-bit samples, sample count: ${pcmBuffer.length / 2}`);
    
    // PCM buffer is already 16kHz, 16-bit, mono - just add WAV header
    const sampleCount = pcmBuffer.length / 2; // 16-bit samples
    const wavDataSize = pcmBuffer.length;
    const wavFileSize = 44 + wavDataSize;
    
    const wavBuffer = Buffer.alloc(wavFileSize);
    
    // WAV Header (16kHz, mono, 16-bit)
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(wavFileSize - 8, 4);
    wavBuffer.write('WAVE', 8);
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20); // PCM
    wavBuffer.writeUInt16LE(1, 22); // Mono
    wavBuffer.writeUInt32LE(16000, 24); // 16kHz sample rate
    wavBuffer.writeUInt32LE(32000, 28); // ByteRate (16000 * 1 * 16 / 8)
    wavBuffer.writeUInt16LE(2, 32); // BlockAlign (1 * 16 / 8)
    wavBuffer.writeUInt16LE(16, 34); // BitsPerSample
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(wavDataSize, 40);
    
    // Copy PCM data directly (no conversion needed)
    pcmBuffer.copy(wavBuffer, 44);
    
    // console.log(`🔄 [PLIVO-SERVICE] Created WAV: ${wavBuffer.length} bytes (${sampleCount} samples) at 16kHz`);
    
    return wavBuffer;
  }

  /**
   * Add audio chunk to buffer and process when 3-second chunk is ready
   */
  addAudioChunk(audioBuffer: Buffer, callId: string): Promise<{ originalText: string, translatedText: string }> {
    return new Promise((resolve) => {
      // console.log(`� [PLIVO-SERVICE] Adding audio chunk for call ${callId}, size: ${audioBuffer.length} bytes`);
      
      // Get or create buffer array for this call
      let buffers = this.audioBuffers.get(callId);
      if (!buffers) {
        buffers = [];
        this.audioBuffers.set(callId, buffers);
      }
      
      // Add current chunk
      buffers.push(audioBuffer);
      
      // Calculate total accumulated size
      const totalSize = buffers.reduce((sum, buf) => sum + buf.length, 0);
      // console.log(`📊 [PLIVO-SERVICE] Accumulated audio size: ${totalSize} bytes (target: ${this.CHUNK_SIZE} bytes)`);
      
      // Check if we have enough for 3 seconds
      if (totalSize >= this.CHUNK_SIZE) {
        // Combine all buffers into one chunk
        const combinedBuffer = Buffer.concat(buffers);
        
        // Take exactly 3 seconds worth of data
        const chunkBuffer = combinedBuffer.slice(0, this.CHUNK_SIZE);
        
        // Keep remaining data for next chunk
        const remainingBuffer = combinedBuffer.slice(this.CHUNK_SIZE);
        
        // Reset buffer with remaining data
        this.audioBuffers.set(callId, remainingBuffer.length > 0 ? [remainingBuffer] : []);
        
        // console.log(`🎙️ [PLIVO-SERVICE] Processing 3-second chunk (${chunkBuffer.length} bytes)`);
        
        // Process the 3-second chunk
        this.transcribeChunk(chunkBuffer, callId)
          .then(result => resolve(result))
          .catch(error => {
            // console.error('❌ [PLIVO-SERVICE] Chunk transcription failed:', error);
            resolve({ originalText: '', translatedText: '' }); // Return empty on error
          });
      } else {
        // Not enough data yet, return empty
        resolve({ originalText: '', translatedText: '' });
      }
    });
  }

  /**
   * Transcribe a 3-second audio chunk using Sarvam AI API
   */
  private async transcribeChunk(audioBuffer: Buffer, callId: string): Promise<{ originalText: string, translatedText: string }> {
    try {
      // console.log(`🎙️ [PLIVO-SERVICE] Transcribing 3-second chunk for call ${callId}, size: ${audioBuffer.length} bytes`);
      
      // Convert 16kHz Linear PCM to WAV format (accepted by Sarvam)
      // console.log(`🔄 [PLIVO-SERVICE] Converting 16kHz PCM to WAV format, size: ${audioBuffer.length} bytes`);
      
      // Direct PCM to WAV conversion (no mu-law conversion needed)
      const wavBuffer = this.convertLinearPcmToWav(audioBuffer);
      // console.log(`🔄 [PLIVO-SERVICE] Converted to WAV, size: ${wavBuffer.length} bytes`);
      
      // Debug: Show first few PCM samples (already 16-bit)
      const pcmSamples = [];
      for (let i = 0; i < Math.min(10, audioBuffer.length - 1); i += 2) {
        pcmSamples.push(audioBuffer.readInt16LE(i));
      }
      // console.log(`🔍 [PLIVO-SERVICE] First 5 PCM samples:`, pcmSamples);
      
      // Save WAV file for debugging
      // const debugDir = path.join(process.cwd(), 'debug_audio');
      // if (!fs.existsSync(debugDir)) {
      //   fs.mkdirSync(debugDir);
      // }
      // const debugFilePath = path.join(debugDir, `debug_${callId}_${Date.now()}.wav`);
      // fs.writeFileSync(debugFilePath, wavBuffer);
      // console.log(`💾 [PLIVO-SERVICE] Saved debug WAV file: ${debugFilePath}`);
      
      const formData = new FormData();
      const audioFile = new File([wavBuffer], `audio_${Date.now()}.wav`, {
        type: 'audio/wav' // WAV format is accepted by Sarvam
      });
      // formData.append('file', audioFile);
      // formData.append('model', 'whisper-1');
      
      // const response = await fetch('http://100.100.108.44:9016/v1/audio/transcriptions', {
      //   method: 'POST',
      //   body: formData,
      // });

      // console.log(`📥 [PLIVO-SERVICE] Whisper API response status: ${response.status}`);

      // if (!response.ok) {
      //   const errorText = await response.text();
      //   console.error(`❌ [PLIVO-SERVICE] Whisper API error ${response.status}:`, errorText);
      //   throw new Error(`Whisper API error: ${response.status}`);
      // }

      // const result = await response.json() as WhisperTranscribeResponse;
      // console.log(`📝 [PLIVO-SERVICE] Whisper API response:`, result);
      
      // const transcript = result.text || '';
      // console.log(`📝 [PLIVO-SERVICE] Extracted transcript: "${transcript}"`);

      // // Accumulate transcript for this call
      // const currentTranscript = this.activeTranscriptions.get(callId) || '';
      // this.activeTranscriptions.set(callId, currentTranscript + ' ' + transcript);
      // // console.log(`📚 [PLIVO-SERVICE] Accumulated transcript for call ${callId}:`, this.activeTranscriptions.get(callId));


      formData.append('file', audioFile);
      const headers = {
        'api-subscription-key': this.sarvamApiKey,
      };

      // First call: Get original language transcription using saaras:v3 with transcribe mode
      const transcribeFormData = new FormData();
      const audioFileForTranscribe = new File([wavBuffer], `audio_${Date.now()}.wav`, { type: 'audio/wav' });
      transcribeFormData.append('file', audioFileForTranscribe);
      transcribeFormData.append('model', 'saaras:v3');
      transcribeFormData.append('mode', 'transcribe');
      transcribeFormData.append('language_code', 'unknown'); // Auto-detect language

      const transcribeResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers,
        body: transcribeFormData,
      });

      console.log(`📥 [PLIVO-SERVICE] Transcribe API response status: ${transcribeResponse.status}`);
      if (!transcribeResponse.ok) {
        const errorText = await transcribeResponse.text();
        console.error(`❌ [PLIVO-SERVICE] Transcribe API error ${transcribeResponse.status}:`, errorText);
        throw new Error(`Transcribe API error: ${transcribeResponse.status}`);
      }

      const transcribeResult = await transcribeResponse.json() as SarvamTranscribeResponse;
      console.log(`📝 [PLIVO-SERVICE] Transcribe API response:`, transcribeResult);
      const originalText = transcribeResult.transcript || '';
      const detectedLanguage = transcribeResult.language_code || 'unknown';

      // Second call: Get English translation using saaras:v3 with translate mode
      const translateFormData = new FormData();
      const audioFileForTranslate = new File([wavBuffer], `audio_${Date.now()}.wav`, { type: 'audio/wav' });
      translateFormData.append('file', audioFileForTranslate);
      translateFormData.append('model', 'saaras:v3');
      translateFormData.append('mode', 'translate');
      translateFormData.append('language_code', 'unknown'); // Auto-detect language

      const translateResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers,
        body: translateFormData,
      });

      console.log(`📥 [PLIVO-SERVICE] Translate API response status: ${translateResponse.status}`);
      let translatedText = '';
      if (translateResponse.ok) {
        const translateResult = await translateResponse.json() as SarvamTranscribeResponse;
        console.log(`📝 [PLIVO-SERVICE] Translate API response:`, translateResult);
        translatedText = translateResult.transcript || '';
      } else {
        console.warn(`⚠️ [PLIVO-SERVICE] Translate API failed, using original text as fallback`);
        translatedText = originalText; // Fallback to original text if translation fails
      }

      // Store both original and translated text
      const currentTranscript = this.activeTranscriptions.get(callId) || '';
      const currentTranslation = this.activeTranslations.get(callId) || '';
      this.activeTranscriptions.set(callId, currentTranscript + ' ' + originalText);
      this.activeTranslations.set(callId, currentTranslation + ' ' + translatedText);
      this.detectedLanguages.set(callId, detectedLanguage);

      console.log(`📝 [PLIVO-SERVICE] Original: "${originalText}", Translated: "${translatedText}", Language: ${detectedLanguage}`);

      // Return the original and translated transcript chunks
      return { originalText, translatedText };
    } catch (error) {
      console.error('❌ [PLIVO-SERVICE] Transcription error:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio using Sarvam AI API (legacy method for compatibility)
   */
  async transcribeAudio(audioBuffer: Buffer, callId: string): Promise<{ originalText: string, translatedText: string }> {
    // Use new chunking method
    return this.addAudioChunk(audioBuffer, callId);
  }

  /**
   * Get complete transcript for a call
   */
  getTranscript(callId: string): string {
    return this.activeTranscriptions.get(callId) || '';
  }

  /**
   * Get English translation for a call
   */
  getTranslation(callId: string): string {
    return this.activeTranslations.get(callId) || '';
  }

  /**
   * Get detected language for a call
   */
  getDetectedLanguage(callId: string): string {
    return this.detectedLanguages.get(callId) || 'unknown';
  }

  /**
   * Clear transcript and audio buffers for a call
   */
  clearTranscript(callId: string): void {
    this.activeTranscriptions.delete(callId);
    this.activeTranslations.delete(callId);
    this.detectedLanguages.delete(callId);
    this.audioBuffers.delete(callId);
  }

  /**
   * Process any remaining audio chunks when call ends
   */
  async processRemainingAudio(callId: string): Promise<{ originalText: string, translatedText: string }> {
    const buffers = this.audioBuffers.get(callId);
    if (buffers && buffers.length > 0) {
      // console.log(`🔄 [PLIVO-SERVICE] Processing final audio chunk for call ${callId}`);
      const combinedBuffer = Buffer.concat(buffers);
      this.audioBuffers.delete(callId);
      
      try {
        return await this.transcribeChunk(combinedBuffer, callId);
      } catch (error) {
        console.error('❌ [PLIVO-SERVICE] Final chunk transcription failed:', error);
        return { originalText: '', translatedText: '' };
      }
    }
    return { originalText: '', translatedText: '' };
  }

  /**
   * Get final English transcript (auto-detected language to English)
   * NOTE: Commented out since we're using Whisper API which already transcribes to English
   */
  // async getFinalEnglishTranscript(callId: string): Promise<string> {
  //   const transcript = this.getTranscript(callId);
  //   if (!transcript.trim()) return '';

  //   try {
  //     // Use existing translate service logic to convert to English
  //     // This is a simplified version - you might want to use the actual service
  //     const response = await fetch('https://api.sarvam.ai/speech-to-text-translate', {
  //       method: 'POST',
  //       headers: {
  //         'api-subscription-key': this.sarvamApiKey,
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         input: transcript,
  //         source_language_code: 'auto',
  //         target_language_code: 'en-IN',
  //         model: 'sarvam-translate:v1',
  //       }),
  //     });

  //     if (response.ok) {
  //       const result = await response.json() as { translated_text?: string };
  //       return result.translated_text || transcript;
  //     }

  //     return transcript;
  //   } catch (error) {
  //     console.error('❌ [PLIVO-SERVICE] Translation error:', error);
  //     return transcript;
  //   }
  // }
}
