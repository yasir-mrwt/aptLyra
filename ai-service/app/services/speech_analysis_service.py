import subprocess
import re
import logging

logger = logging.getLogger(__name__)


class SpeechAnalysisService:
    FILLER_WORDS = [r"\buh\b", r"\bum\b", r"\bhmm\b", r"\buhh\b", r"\bumm\b", r"\bah\b", r"\bahh\b"]

    @staticmethod
    def analyze_audio(file_path: str, transcript: str):
        """
        Analyzes an audio file to extract speech metrics: pace, pauses, and filler words.
        Uses fast ffmpeg heuristics to prevent server timeouts on cloud deployments.
        """
        # Chrome WebM uploads often lack duration headers, making ffprobe return 'N/A'.
        # Instead, we run ffmpeg frame decoding (which we need for silence anyway)
        # and extract the exact final timestamp.
        try:
            cmd_silence = [
                'ffmpeg', '-i', file_path, '-af', 'silencedetect=noise=-30dB:d=0.8', '-f', 'null', '-'
            ]
            output = subprocess.check_output(cmd_silence, stderr=subprocess.STDOUT).decode('utf-8')
            
            pause_time_sec = 0.0
            pause_count = 0
            duration_sec = 0.0
            
            for line in output.split('\n'):
                if 'silence_duration: ' in line:
                    parts = line.split('silence_duration: ')
                    if len(parts) > 1:
                        try:
                            val = float(parts[1].split()[0])
                            pause_time_sec += val
                            pause_count += 1
                        except ValueError:
                            pass
                elif 'time=' in line:
                    try:
                        time_match = re.search(r'time=(\d+):(\d+):(\d+\.\d+)', line)
                        if time_match:
                            h, m, s = time_match.groups()
                            duration_sec = float(h) * 3600 + float(m) * 60 + float(s)
                    except Exception:
                        pass
                        
            # Failsafe if duration wasn't parsed
            if duration_sec <= 0:
                raise ValueError("Failed to parse duration from ffmpeg output")
                            
            speaking_time_sec = max(0.0, duration_sec - pause_time_sec)
            
        except Exception as e:
            logger.warning(f"ffmpeg failed ({e}), falling back to heuristic duration")
            words_temp = re.findall(r"\b\w+\b", transcript)
            duration_sec = (len(words_temp) / 130.0) * 60.0
            estimated_speaking_time = duration_sec
            speaking_time_sec = min(duration_sec, estimated_speaking_time)
            pause_time_sec = max(0, duration_sec - speaking_time_sec)
            pause_count = int(len(words_temp) / 15) if pause_time_sec > 2.0 else 0

        try:
            speaking_time_min = speaking_time_sec / 60.0 if speaking_time_sec > 0 else (duration_sec / 60.0)
            words = re.findall(r"\b\w+\b", transcript)
            word_count = len(words)
            pace_wpm = word_count / speaking_time_min if speaking_time_min > 0 else 0

            # Count filler words
            filler_count = 0
            transcript_lower = transcript.lower()
            for pattern in SpeechAnalysisService.FILLER_WORDS:
                filler_count += len(re.findall(pattern, transcript_lower))

            return {
                "duration_seconds": round(duration_sec, 2),
                "speaking_time_seconds": round(speaking_time_sec, 2),
                "pause_time_seconds": round(pause_time_sec, 2),
                "pause_count": pause_count,
                "word_count": word_count,
                "pace_wpm": round(pace_wpm, 2),
                "filler_words_count": filler_count,
            }
        except Exception as e:
            logger.error(f"Error in speech analysis: {e}")
            return {
                "error": str(e),
                "duration_seconds": 0,
                "speaking_time_seconds": 0,
                "pause_time_seconds": 0,
                "pause_count": 0,
                "word_count": len(re.findall(r"\b\w+\b", transcript)),
                "pace_wpm": 0,
                "filler_words_count": 0,
            }
