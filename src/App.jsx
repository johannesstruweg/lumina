import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, Share2, Download, RefreshCw, Play, Pause, Loader2, X, Instagram, Zap } from 'lucide-react';

// --- API Configuration ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; 

// --- Helper: Convert File to Base64 (Retained for display) ---
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
  });
};

// --- NEW Helper: Resize Image Client-Side (Optimization 1: Input) ---
// Resizes image to 1024px maximum width/height while maintaining aspect ratio,
// and outputs a Base64 string.
const resizeImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1024; // Target max size for speed
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG with moderate compression (0.7 quality)
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(resizedDataUrl.split(',')[1]); // Resolve with Base64 data only
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};


// --- Helper: Gemini Image Generation (Optimization 2: Prompt) ---
const generateEditorialImage = async (base64Image, posePrompt) => {
  if (!apiKey) {
    console.error("API Key missing. Please check .env file.");
    throw new Error("API Key missing");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
  
  // OPTIMIZATION: Simplified prompt for faster generation time (removed '8k resolution', 'dramatic studio lighting')
  const fullPrompt = `
    Transform this person into a high-fashion editorial magazine shot.
    Style: Vogue cover aesthetic, high detail, photorealistic.
    Pose: ${posePrompt}
    Keep the person's facial features recognizable but stylized.
    Background: Clean minimalist studio or blurred bokeh.
    
    CRITICAL: Generate ONLY the photograph with NO text, NO watermarks, NO labels, NO words anywhere in the image.
    The image should be a pure fashion photograph without any text overlays.
  `;

  const payload = {
    contents: [{
      parts: [
        { text: fullPrompt },
        { inlineData: { mimeType: "image/jpeg", data: base64Image } }
      ]
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      temperature: 0.8 // Slightly lower temperature for consistency/speed
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error(`API Error for pose: ${posePrompt}`, response.statusText);
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const imageBase64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    
    if (!imageBase64) {
      console.error("No image data in response for pose:", posePrompt);
      throw new Error("No image generated");
    }
    
    return `data:image/jpeg;base64,${imageBase64}`;
  } catch (error) {
    console.error("Generation failed:", error);
    throw error;
  }
};

// --- Styles & Poses (4 poses) ---
const POSES = [
  "Close-up beauty shot, hands framing the face, intense gaze, soft lighting.",
  "Full body power pose, walking towards camera, wind in hair, low angle shot.",
  "Side profile silhouette, soft rim lighting, moody atmosphere, looking away.",
  "Sitting on a high stool, chic and relaxed, fashion week street style, confident smile."
];

// --- Main Component ---
export default function LuminaApp() {
  const [step, setStep] = useState('upload');
  const [originalImage, setOriginalImage] = useState(null);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [renderingProgress, setRenderingProgress] = useState(0); // Added for detailed video feedback
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg("Please upload a valid image file.");
      return;
    }

    // Optimization 1: Resize and compress input image
    setLoadingProgress(5);
    const resizedBase64 = await resizeImage(file);
    
    // Display the original file locally but process the resized one
    const originalBase64 = await fileToBase64(file);
    setOriginalImage(originalBase64);
    
    setStep('processing');
    processImages(resizedBase64);
  };

  const processImages = async (base64Input) => {
    if (!apiKey) {
       setErrorMsg("API Key is missing! Check your .env file.");
       setStep('upload');
       return;
    }
    
    setLoadingProgress(10);
    const progressPerImage = 90 / POSES.length; 
    
    // Optimization 3: Parallelization using Promise.all
    const generationPromises = POSES.map((pose) => 
        (async () => {
            try {
                const result = await generateEditorialImage(base64Input, pose);
                // Update progress after completion
                setLoadingProgress(prev => Math.min(prev + progressPerImage, 95));
                return result;
            } catch (err) {
                console.error(`Failed to generate image for pose: ${pose}`, err);
                // Still update progress even if it fails, to prevent a stuck loading bar
                setLoadingProgress(prev => Math.min(prev + progressPerImage, 95));
                return null;
            }
        })()
    );

    const results = (await Promise.all(generationPromises)).filter(result => result !== null);

    if (results.length === 0) {
      setErrorMsg("Failed to generate any images. Please try again.");
      setStep('upload');
      return;
    }

    setGeneratedImages(results);
    setLoadingProgress(100);
    
    // Generate video using the first image
    if (results.length > 0) {
      setTimeout(() => generateGlamCamVideo(results[0]), 500);
    }
    setStep('results');
  };

  // Re-injecting robust video logic (with progress and browser compatibility)
  const generateGlamCamVideo = async (imageSrc) => {
    setIsVideoGenerating(true);
    setRenderingProgress(0);
    
    try {
        // 1. Setup Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false }); 
        const width = 720;
        const height = 1280; 
        canvas.width = width;
        canvas.height = height;

        // 2. Load Image
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = "anonymous"; 
          image.onload = () => resolve(image);
          image.onerror = (e) => reject(e);
          image.src = imageSrc;
        });

        // 3. Detect Supported Mime Type (Crucial for cross-browser stability)
        const types = [
          "video/mp4",
          "video/webm;codecs=vp9", 
          "video/webm;codecs=vp8", 
          "video/webm;codecs=h264", 
          "video/webm"
        ];
        const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || "";
        
        if (!mimeType) {
           console.warn("No supported video mime type found. Trying default.");
        }

        // 4. Setup Recorder
        const stream = canvas.captureStream(30); // 30 FPS
        const options = mimeType ? { mimeType } : undefined;
        const mediaRecorder = new MediaRecorder(stream, options);
        const chunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
          const url = URL.createObjectURL(blob);
          setVideoUrl(url);
          setIsVideoGenerating(false);
          setRenderingProgress(100);
        };

        // 5. Start Animation Loop
        mediaRecorder.start();

        const fps = 30;
        const durationSeconds = 3; 
        const totalFrames = fps * durationSeconds;
        let frame = 0;

        const animate = () => {
          if (frame >= totalFrames) {
            mediaRecorder.stop();
            return;
          }

          // Update Progress UI
          setRenderingProgress(Math.round((frame / totalFrames) * 100));

          // --- Render Logic (Slow Motion / Ken Burns) ---
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);

          const t = frame / totalFrames;
          const smoothT = t * t * (3 - 2 * t); 

          const scale = 1.0 + (0.1 * smoothT);
          const panY = 0 - (10 * smoothT);

          const imgAspect = img.width / img.height;
          const canvasAspect = width / height;
          let drawW, drawH, offsetX, offsetY;

          if (imgAspect > canvasAspect) {
            drawH = height * scale;
            drawW = drawH * imgAspect;
            offsetX = (width - drawW) / 2;
            offsetY = ((height - drawH) / 2) + panY;
          } else {
            drawW = width * scale;
            drawH = drawW / imgAspect;
            offsetX = (width - drawW) / 2;
            offsetY = ((height - drawH) / 2) + panY;
          }

          ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

          // "Flash" overlay at start
          if (frame < 4) {
              ctx.fillStyle = `rgba(255, 255, 255, ${0.8 - (frame * 0.2)})`;
              ctx.fillRect(0,0, width, height);
          }

          frame++;
          requestAnimationFrame(animate);
        };

        animate();

    } catch (err) {
        console.error("Video generation error:", err);
        setErrorMsg(`Video failed: ${err.message}`);
        setIsVideoGenerating(false);
    }
  };

  const handleDownloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    const ext = videoUrl.includes('mp4') ? 'mp4' : 'webm';
    a.download = `lumina-glamcam.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadImage = (src, index) => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `lumina-editorial-${index + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (navigator.share && videoUrl) {
      try {
        const blob = await fetch(videoUrl).then(r => r.blob());
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `lumina-glamcam.${ext}`, { type: blob.type });
        await navigator.share({
          title: 'My LUMINA Edit',
          text: 'Check out my AI-generated fashion shoot!',
          files: [file]
        });
      } catch (err) {
        console.log("Share failed", err);
      }
    } else {
      alert("Native sharing not supported on this device. Please download the video instead.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-pink-500 selection:text-white overflow-x-hidden">
      <header className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-violet-600 rounded-full flex items-center justify-center">
              <Zap className="w-5 h-5 text-white fill-current" />
            </div>
            <span className="text-xl font-serif tracking-widest font-bold">LUMINA</span>
          </div>
          {step === 'results' && (
            <button 
              onClick={() => { setStep('upload'); setGeneratedImages([]); setVideoUrl(null); setErrorMsg(""); }}
              className="text-xs uppercase tracking-widest hover:text-pink-500 transition-colors"
            >
              New Shoot
            </button>
          )}
        </div>
      </header>

      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto min-h-screen flex flex-col">
        
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200 flex justify-between items-center animate-in slide-in-from-top-4">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")}><X className="w-4 h-4" /></button>
          </div>
        )}

        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6 leading-tight">
              Your Personal <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500">
                Editorial Shoot
              </span>
            </h1>
            <p className="text-zinc-400 mb-12 max-w-md text-lg">
              Upload a selfie. Our AI will style you into a high-fashion photoshoot and generate a dynamic moving video.
              <br/>
              <span className='text-xs text-zinc-500 mt-2 block'>
                (Optimized for speed: Your input image will be resized before AI processing.)
              </span>
            </p>

            <div className="relative group w-full max-w-md aspect-[4/5] md:aspect-video rounded-2xl border-2 border-dashed border-zinc-700 hover:border-pink-500 transition-colors bg-zinc-900/50 flex flex-col items-center justify-center overflow-hidden cursor-pointer">
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <div className="p-4 rounded-full bg-zinc-800 group-hover:scale-110 transition-transform mb-4">
                <Camera className="w-8 h-8 text-pink-500" />
              </div>
              <h3 className="text-xl font-medium mb-2">Take a Selfie or Upload</h3>
              <p className="text-sm text-zinc-500">JPG, PNG up to 5MB</p>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-700">
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
              <div 
                className="absolute inset-0 border-4 border-pink-500 rounded-full border-t-transparent animate-spin"
              ></div>
            </div>
            <h2 className="text-2xl font-serif font-bold mb-2">Developing Films</h2>
            <p className="text-zinc-400 animate-pulse">Running 4 parallel image generations...</p>
            
            <div className="w-full max-w-xs mt-8 bg-zinc-900 h-1 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-pink-500 to-violet-600 transition-all duration-500"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <p className="mt-2 text-xs text-zinc-600 font-mono">{loadingProgress.toFixed(0)}% COMPLETE</p>
          </div>
        )}

        {step === 'results' && (
          <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-700">
            
            {generatedImages.length < POSES.length && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-200 text-sm">
                Note: Generated {generatedImages.length} of {POSES.length} images. Some images failed to generate.
              </div>
            )}

            {/* Video Showcase */}
            <div className="w-full bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl shadow-pink-500/10 border border-zinc-800">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="font-serif text-xl">Strike a Pose</h3>
                {isVideoGenerating && (
                   <span className="flex items-center gap-2 text-xs text-pink-500 uppercase tracking-wider">
                     <Loader2 className="w-3 h-3 animate-spin" /> Rendering {renderingProgress}%
                   </span>
                )}
              </div>
              <div className="aspect-[9/16] md:aspect-video bg-black relative flex items-center justify-center">
                {videoUrl ? (
                  <video 
                    src={videoUrl} 
                    autoPlay 
                    loop 
                    playsInline 
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-zinc-500 flex flex-col items-center justify-center h-full p-8 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <p className="text-sm">Developing Motion...</p>
                    <p className="text-xs text-zinc-600 mt-2">Please wait while we animate your photo.</p>
                  </div>
                )}
              </div>
              <div className="p-4 bg-zinc-900 flex gap-2 justify-center">
                 <button 
                   onClick={handleDownloadVideo}
                   disabled={!videoUrl}
                   className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                 >
                   <Download className="w-4 h-4" /> Save Video
                 </button>
                 <button 
                    onClick={handleShare}
                    disabled={!videoUrl}
                    className="flex items-center gap-2 px-6 py-3 bg-pink-600 text-white rounded-full font-medium hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>
              </div>
            </div>

            {/* Photo Grid */}
            <div>
              <h3 className="font-serif text-xl mb-4 pl-2 border-l-4 border-pink-500">Editorial Prints ({generatedImages.length})</h3>
              <div className="grid grid-cols-2 gap-4">
                {generatedImages.map((src, idx) => (
                  <div key={idx} className="group relative aspect-[4/5] bg-zinc-900 rounded-xl overflow-hidden shadow-lg border border-zinc-800/50 hover:border-pink-500/50 transition-all">
                    <img 
                      src={src} 
                      alt={`Editorial ${idx + 1}`} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                      <button 
                        onClick={() => handleDownloadImage(src, idx)}
                        className="p-3 bg-white text-black rounded-full hover:scale-110 transition-transform"
                        title="Download"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] uppercase tracking-wider text-white/80">
                      0{idx+1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-zinc-600 text-sm">
        <p>POWERED BY GEMINI 2.5 • LUMINA STUDIOS © 2025</p>
      </footer>
    </div>
  );
}
