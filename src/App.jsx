import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, Share2, Download, RefreshCw, Play, Pause, Loader2, X, Instagram, Zap } from 'lucide-react';

// --- API Configuration ---
// Switched to Environment Variable for security
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; 

// --- Helper: Convert File to Base64 ---
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
  });
};

// --- Helper: Gemini Image Generation ---
const generateEditorialImage = async (base64Image, posePrompt) => {
  if (!apiKey) {
    console.error("API Key missing. Please check .env file.");
    throw new Error("API Key missing");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
  
  const fullPrompt = `
    Transform this person into a high-fashion editorial magazine shot.
    Style: Vogue-style photography, 8k resolution, dramatic studio lighting, photorealistic, sharp focus.
    Pose: ${posePrompt}
    Keep the person's facial features recognizable but stylized.
    Background: Minimalist luxury studio or blurred city bokeh.
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
      temperature: 0.9 
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    
    const data = await response.json();
    const imageBase64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    
    if (!imageBase64) throw new Error("No image generated");
    
    return `data:image/jpeg;base64,${imageBase64}`;
  } catch (error) {
    console.error("Generation failed:", error);
    return null;
  }
};

// --- Styles & Poses ---
const POSES = [
  "Close-up beauty shot, hands framing the face, intense gaze, soft lighting.",
  "Full body power pose, walking towards camera, wind in hair, low angle shot.",
  "Side profile silhouette, dramatic rim lighting, moody atmosphere, looking away.",
  "Sitting on a high stool, chic and relaxed, fashion week street style, confident smile."
];

// --- Main Component ---
export default function LuminaApp() {
  const [step, setStep] = useState('upload'); // upload, processing, results
  const [originalImage, setOriginalImage] = useState(null);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // --- Handlers ---

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg("Please upload a valid image file.");
      return;
    }

    const base64 = await fileToBase64(file);
    setOriginalImage(base64);
    setStep('processing');
    processImages(base64);
  };

  const processImages = async (base64Input) => {
    if (!apiKey) {
       setErrorMsg("API Key is missing! Check your .env file.");
       setStep('upload');
       return;
    }
    setLoadingProgress(10);
    const results = [];
    
    for (let i = 0; i < POSES.length; i++) {
      try {
        const result = await generateEditorialImage(base64Input, POSES[i]);
        if (result) {
          results.push(result);
        }
        setLoadingProgress((prev) => prev + 20);
      } catch (err) {
        console.error(err);
      }
    }

    if (results.length === 0) {
      setErrorMsg("Failed to generate images. Please try again.");
      setStep('upload');
      return;
    }

    setGeneratedImages(results);
    setLoadingProgress(100);
    generateGlamCamVideo(results);
    setStep('results');
  };

  const generateGlamCamVideo = async (images) => {
    setIsVideoGenerating(true);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = 720;
    const height = 1280; 
    canvas.width = width;
    canvas.height = height;

    const imageElements = await Promise.all(images.map(src => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.src = src;
      });
    }));

    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    const chunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setIsVideoGenerating(false);
    };

    mediaRecorder.start();

    const durationPerImage = 60; 
    const totalFrames = durationPerImage * imageElements.length;
    let frame = 0;

    const animate = () => {
      if (frame >= totalFrames) {
        mediaRecorder.stop();
        return;
      }

      const imgIndex = Math.floor(frame / durationPerImage);
      const localFrame = frame % durationPerImage;
      const currentImg = imageElements[imgIndex];

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      if (currentImg) {
        const maxScale = 1.2;
        const scale = 1.0 + (0.2 * (localFrame / durationPerImage));
        
        const imgAspect = currentImg.width / currentImg.height;
        const canvasAspect = width / height;
        let drawW, drawH, offsetX, offsetY;

        if (imgAspect > canvasAspect) {
          drawH = height * scale;
          drawW = drawH * imgAspect;
          offsetX = (width - drawW) / 2;
          offsetY = (height - drawH) / 2;
        } else {
          drawW = width * scale;
          drawH = drawW / imgAspect;
          offsetX = (width - drawW) / 2;
          offsetY = (height - drawH) / 2;
        }

        ctx.drawImage(currentImg, offsetX, offsetY, drawW, drawH);

        if (localFrame < 5) {
            ctx.fillStyle = `rgba(255, 255, 255, ${1 - (localFrame/5)})`;
            ctx.fillRect(0,0, width, height);
        }
        
        ctx.font = '700 40px serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('LUMINA', width / 2, height - 100);
      }

      frame++;
      requestAnimationFrame(animate);
    };

    animate();
  };

  const handleDownloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = 'lumina-glamcam.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadImage = (src, index) => {
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
        const file = new File([blob], 'lumina-glamcam.webm', { type: 'video/webm' });
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
              onClick={() => { setStep('upload'); setGeneratedImages([]); setVideoUrl(null); }}
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
              Upload a selfie. Our AI will style you into a high-fashion photoshoot and generate a dynamic GlamCam video.
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
            <p className="text-zinc-400 animate-pulse">Applying studio lighting and posing...</p>
            
            <div className="w-full max-w-xs mt-8 bg-zinc-900 h-1 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-pink-500 to-violet-600 transition-all duration-500"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <p className="mt-2 text-xs text-zinc-600 font-mono">{loadingProgress}% COMPLETE</p>
          </div>
        )}

        {step === 'results' && (
          <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-700">
            
            <div className="w-full bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl shadow-pink-500/10 border border-zinc-800">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="font-serif text-xl">The GlamCam</h3>
                {isVideoGenerating && (
                   <span className="flex items-center gap-2 text-xs text-pink-500 uppercase tracking-wider">
                     <Loader2 className="w-3 h-3 animate-spin" /> Rendering Video
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
                  <div className="text-zinc-500 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <p>Rendering GlamCam...</p>
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

            <div>
              <h3 className="font-serif text-xl mb-4 pl-2 border-l-4 border-pink-500">Editorial Prints</h3>
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
                      Print 0{idx+1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </main>

      <footer className="py-8 text-center text-zinc-600 text-sm">
        <p>POWERED BY GEMINI 2.5 • LUMINA STUDIOS © 2025</p>
      </footer>
    </div>
  );
}
