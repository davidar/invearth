/**
 * WebM video recorder for canvas
 * Records one full animation cycle and downloads the result
 */

export function createRecorder(canvas, onComplete) {
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;

  return {
    get isRecording() {
      return isRecording;
    },

    start() {
      if (isRecording) return false;

      // Get canvas stream at 60fps
      const stream = canvas.captureStream(60);

      // Try VP9 first (better quality), fall back to VP8
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm;codecs=vp8';

      console.log(`Recording with codec: ${mimeType}`);

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps for good quality
      });

      recordedChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);

        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `invearth-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up
        URL.revokeObjectURL(url);
        recordedChunks = [];
        isRecording = false;

        console.log('Recording saved!');
        if (onComplete) onComplete();
      };

      mediaRecorder.start(100); // Collect data every 100ms
      isRecording = true;
      console.log('Recording started...');
      return true;
    },

    stop() {
      if (!isRecording || !mediaRecorder) return false;

      mediaRecorder.stop();
      return true;
    }
  };
}
