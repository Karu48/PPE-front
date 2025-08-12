import React, { useState, useRef } from "react";
import { Button, Card, ProgressBar, Row, Col } from "react-bootstrap";
import gateway from "../utils/gateway";
import { ppeMapper } from "../utils/ppe";
import VideoBoundingBox from "./VideoBoundingBox";
import PPEChart from "./PPEChart";

const VideoUpload = () => {
  const [videoFile, setVideoFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [webcamCoordinates, setWebcamCoordinates] = useState({});
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Configuration for frame extraction
  const FRAME_INTERVAL = 1;

  // Detection parameters (tweakable from the UI)
  const [detectionMethod, setDetectionMethod] = useState("any"); // 'any' | 'percentage'
  const [windowSizeSeconds, setWindowSizeSeconds] = useState(3); // seconds
  const [percentageThreshold, setPercentageThreshold] = useState(50); // only for 'percentage'

  // Extract frames from video at regular intervals
  const extractFrames = async (videoBlob) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true; // Mute to avoid audio issues
      video.playsInline = true; // Prevent fullscreen on mobile
      video.src = URL.createObjectURL(videoBlob);
      
      video.onloadedmetadata = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const frames = [];
        const frameInterval = FRAME_INTERVAL * 1000; // Convert to milliseconds
        const duration = video.duration * 1000;
        const totalFrames = Math.ceil(duration / frameInterval);
        let processedFrames = 0;
        
        // Set canvas dimensions once
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const extractFrameAtTime = (time) => {
          return new Promise((resolveFrame) => {
            // Use a separate video element for each frame to avoid conflicts
            const frameVideo = document.createElement('video');
            frameVideo.muted = true;
            frameVideo.playsInline = true;
            frameVideo.src = URL.createObjectURL(videoBlob);
            
            frameVideo.onloadedmetadata = () => {
              frameVideo.currentTime = time / 1000;
              
              frameVideo.onseeked = () => {
                // Draw frame to canvas
                ctx.drawImage(frameVideo, 0, 0);
                
                // Convert to blob with lower quality to reduce memory usage
                canvas.toBlob((blob) => {
                  const frame = {
                    time: time,
                    image: blob,
                    timestamp: time / 1000
                  };
                  frames.push(frame);
                  processedFrames++;
                  
                  // Clean up frame video element
                  URL.revokeObjectURL(frameVideo.src);
                  
                  if (processedFrames === totalFrames) {
                    // Clean up main video element
                    URL.revokeObjectURL(video.src);
                    resolve(frames);
                  } else {
                    // Extract next frame with a small delay to prevent blocking
                    const nextTime = processedFrames * frameInterval;
                    if (nextTime < duration) {
                      setTimeout(() => extractFrameAtTime(nextTime), 10);
                    }
                  }
                  resolveFrame(frame);
                }, 'image/jpeg', 0.85); // Reduced quality to 0.7 for better performance
              };
            };
          });
        };
        
        // Start extracting frames with initial delay
        setTimeout(() => extractFrameAtTime(0), 100);
      };
    });
  };

  // Process video frames through API
  const processVideoFrames = async (frames) => {
    const results = [];
    const batchSize = 5; // Process 5 frames at a time to prevent blocking
    
    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);
      const batchPromises = batch.map(async (frame, batchIndex) => {
        const frameIndex = i + batchIndex;
        setProcessingProgress((frameIndex / frames.length) * 100);
        
        try {
          // Convert blob to base64
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64String = reader.result.split(',')[1];
              resolve(base64String);
            };
            reader.readAsDataURL(frame.image);
          });

          // Call actual API
          const result = await gateway.processImage(base64);
          return {
            timestamp: frame.timestamp,
            time: frame.time,
            result: result
          };
        } catch (error) {
          console.error('Error processing frame:', error);
          // Add empty result for failed frames
          return {
            timestamp: frame.timestamp,
            time: frame.time,
            result: { Persons: [] }
          };
        }
      });
      
      // Wait for current batch to complete before processing next batch
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to prevent blocking
      if (i + batchSize < frames.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    return results;
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('video/')) {
      // Initialize chart variables
      setAnalysisResults([]); // Clear previous chart data
      setCurrentTime(0);      // Reset chart/video time
      // Check file size and warn for large files
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 100) {
        const proceed = window.confirm(
          `El archivo es muy grande (${fileSizeMB.toFixed(1)} MB). ` +
          'El procesamiento puede tomar mucho tiempo y causar pausas en la reproducción. ' +
          '¿Desea continuar?'
        );
        if (!proceed) {
          return;
        }
      }
      
      setVideoFile(file);
      setIsProcessing(true);
      setProcessingProgress(0);
      
      try {
        // Extract frames
        const frames = await extractFrames(file);
        
        // Process frames
        const results = await processVideoFrames(frames);
        setAnalysisResults(results);
        
      } catch (error) {
        console.error('Error processing video:', error);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      // Update webcam coordinates for bounding boxes
      const videoElement = videoRef.current;
      if (videoElement) {
        setWebcamCoordinates(videoElement.getBoundingClientRect());
      }
    }
  };

  // Timeline aggregation removed

  // Timeline utilities removed





  const getCurrentFrameResults = () => {
    const currentAlerts = analysisResults.filter(result => 
      Math.abs(result.timestamp - currentTime) < 0.5
    );
    if (currentAlerts.length > 0) {
      return currentAlerts[0].result;
    }
    return { Persons: [] };
  };







  return (
    <div style={{ padding: "20px" }}>
      {/* Controls */}
      <Card style={{ marginBottom: "20px" }}>
        <Card.Header>
          <strong>Parámetros de Detección</strong>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={4} sm={12} style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600 }}>Método</label>
              <select
                className="form-control"
                value={detectionMethod}
                onChange={(e) => setDetectionMethod(e.target.value)}
              >
                <option value="any">Al menos una detección</option>
                <option value="percentage">% de detecciones en ventana</option>
              </select>
            </Col>
            <Col md={4} sm={12} style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600 }}>Tamaño de ventana (seg)</label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                className="form-control"
                value={windowSizeSeconds}
                onChange={(e) => setWindowSizeSeconds(Number(e.target.value))}
              />
            </Col>
            {detectionMethod === "percentage" && (
              <Col md={4} sm={12} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontWeight: 600 }}>Umbral (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  className="form-control"
                  value={percentageThreshold}
                  onChange={(e) => setPercentageThreshold(Number(e.target.value))}
                />
              </Col>
            )}
          </Row>
        </Card.Body>
      </Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2>Análisis de Video EPP</h2>
        {videoFile && (
          <Button 
            variant="outline-secondary" 
            size="sm"
            onClick={() => {
              setVideoFile(null);
              setAnalysisResults([]);
              setCurrentTime(0);
              setProcessingProgress(0);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
          >
            Cambiar Video
          </Button>
        )}
      </div>
      
      {/* File Upload */}
      {!videoFile && (
        <Card style={{ marginBottom: "20px" }}>
          <Card.Body>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <Button 
              onClick={() => fileInputRef.current.click()}
              disabled={isProcessing}
              variant="primary"
            >
              {isProcessing ? "Procesando..." : "Seleccionar Video"}
            </Button>
            
            {isProcessing && (
              <div style={{ marginTop: "10px" }}>
                <ProgressBar 
                  now={processingProgress} 
                  label={`${Math.round(processingProgress)}%`}
                />
                <small style={{ color: "#6c757d" }}>
                  Extrayendo y analizando frames del video...
                </small>
              </div>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Timeline removed */}

      {/* Video and Analysis Layout */}
      {videoFile && (
        <Row>
          <Col md={4} sm={6}>
            {/* PPE Chart */}
            {analysisResults.length > 0 ? (
              <PPEChart 
                key={`chart-${Math.round(currentTime)}-${detectionMethod}-${windowSizeSeconds}-${percentageThreshold}`}
                analysisResults={analysisResults}
                currentTime={currentTime}
                detectionMethod={detectionMethod}
                windowSizeSeconds={windowSizeSeconds}
                percentageThreshold={percentageThreshold}
              />
            ) : (
              <Card>
                <Card.Header>
                  <strong>Estado EPP</strong>
                </Card.Header>
                <Card.Body>
                  {isProcessing ? (
                    <div>
                      <ProgressBar 
                        now={processingProgress} 
                        label={`${Math.round(processingProgress)}%`}
                      />
                      <small style={{ color: "#6c757d", marginTop: "10px", display: "block" }}>
                        Procesando video...
                      </small>
                    </div>
                  ) : (
                    <p className="text-muted">No hay análisis disponible</p>
                  )}
                </Card.Body>
              </Card>
            )}
          </Col>
          <Col md={8} sm={6}>
            {/* Video Player with Bounding Boxes */}
            <Card>
              <Card.Body>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <video
                    ref={videoRef}
                    controls
                    style={{ width: "100%", maxHeight: "400px" }}
                    onTimeUpdate={handleVideoTimeUpdate}
                  >
                    <source src={URL.createObjectURL(videoFile)} type={videoFile.type} />
                  </video>
                  {/* Bounding Boxes Overlay */}
                  {analysisResults.length > 0 && (
                    <div style={{ 
                      position: "absolute", 
                      top: 0, 
                      left: 0, 
                      width: "100%", 
                      height: "100%",
                      pointerEvents: "none"
                    }}>
                      {getCurrentFrameResults().Persons.map((person, index) => {
                        const mappedPerson = ppeMapper(person);
                        return (
                          <VideoBoundingBox
                            key={index}
                            person={person}
                            webcamCoordinates={webcamCoordinates}
                            isMissing={mappedPerson.hasAlarm}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default VideoUpload; 