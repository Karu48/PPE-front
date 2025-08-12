import React, { useEffect, useRef, useState } from "react";
import { findDOMNode } from "react-dom";
import { AmplifyAuthenticator, AmplifySignIn } from "@aws-amplify/ui-react/legacy";
import { onAuthUIStateChange } from "@aws-amplify/ui-components";
import Webcam from "react-webcam";
import { Alert, Col, Row, Nav, Navbar, Card } from "react-bootstrap";

import gateway from "./utils/gateway";
import { ppeMapper } from "./utils/ppe";
import { isUndefined, formatErrorMessage } from "./utils";

import CameraHelp from "./components/CameraHelp";
import ProtectionSummary from "./components/ProtectionSummary";
import Header from "./components/Header";
import SettingsHelp from "./components/SettingsHelp";
import Navigation from "./components/Navigation";
import VideoUpload from "./components/VideoUpload";

const App = () => {
  const [authState, setAuthState] = useState("signin");
  const [testResults, setTestResults] = useState([]);
  const [errorDetails, setErrorDetails] = useState(undefined);
  const [readyToStream, setReadyToStream] = useState(false);
  const [webcamCoordinates, setWebcamCoordinates] = useState({});
  const [activeMode, setActiveMode] = useState("live");
  const iterating = useRef(false);
  const webcam = useRef(undefined);
  const resultsBufferRef = useRef([]);

  // Live detection parameters
  const [liveDetectionMethod, setLiveDetectionMethod] = useState("any"); // 'any' | 'percentage'
  const [liveWindowSizeSeconds, setLiveWindowSizeSeconds] = useState(3);
  const [livePercentageThreshold, setLivePercentageThreshold] = useState(50);

  const getSnapshot = async () => {
    setWebcamCoordinates(findDOMNode(webcam.current).getBoundingClientRect());
    const image = webcam.current.getScreenshot();
    const b64Encoded = image.split(",")[1];

    try {
      const result = await gateway.processImage(b64Encoded);
      const people = result.Persons.map(ppeMapper);

      // Buffer recent frame outcomes
      const now = Date.now() / 1000;
      const hasAlarmFrame = people.some((p) => p.hasAlarm);
      const buffer = resultsBufferRef.current;
      buffer.push({ t: now, hasAlarm: hasAlarmFrame });
      // Keep a reasonable history (at least up to 2x current window, min 30s)
      const maxKeep = Math.max(30, (Number(liveWindowSizeSeconds) || 3) * 2);
      while (buffer.length && buffer[0].t < now - maxKeep) buffer.shift();

      // Compute decision over the last N seconds
      const windowSize = Math.max(0.5, Number(liveWindowSizeSeconds) || 3);
      const windowFrames = buffer.filter((x) => x.t >= now - windowSize);
      let shouldShow = true;
      if (windowFrames.length > 0) {
        if (liveDetectionMethod === "any") {
          shouldShow = windowFrames.some((x) => x.hasAlarm);
        } else {
          const positives = windowFrames.filter((x) => x.hasAlarm).length;
          const percent = (positives / windowFrames.length) * 100;
          shouldShow = percent >= (Number(livePercentageThreshold) || 0);
        }
      }

      setTestResults(shouldShow ? people : []);

      if (iterating.current) setTimeout(getSnapshot, 300);
      else setTestResults([]);
    } catch (e) {
      setErrorDetails(formatErrorMessage(e));
      console.log(e);
    }
  };

  const setupWebcam = (instance) => {
    webcam.current = instance;

    const checkIfReady = () => {
      if (
        webcam.current &&
        webcam.current.state &&
        webcam.current.state.hasUserMedia
      ) {
        setReadyToStream(true);
      } else setTimeout(checkIfReady, 250);
    };

    checkIfReady();
  };

  const toggleRekognition = () => {
    iterating.current = !iterating.current;

    if (iterating.current) {
      getSnapshot();
    } else setTestResults([]);
  };

  useEffect(() => {
    return onAuthUIStateChange((s) => setAuthState(s));
  }, []);

  const signedIn = authState === "signedin";

  const renderLiveCamera = () => (
    <>
      <CameraHelp show={!readyToStream} />
      <Row>
        <Col md={8} sm={6}>
          <Webcam
            audio={false}
            ref={setupWebcam}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              width: 1280,
              height: 640,
              facingMode: "user",
            }}
            style={{ width: "100%", marginTop: "10px" }}
          />
        </Col>
        <Col md={4} sm={6}>
          {/* Live detection parameters */}
          <Card style={{ marginBottom: "10px" }}>
            <Card.Header>
              <strong>Parámetros (Cámara en Vivo)</strong>
            </Card.Header>
            <Card.Body>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontWeight: 600 }}>Método</label>
                <select
                  className="form-control"
                  value={liveDetectionMethod}
                  onChange={(e) => setLiveDetectionMethod(e.target.value)}
                >
                  <option value="any">Al menos una detección</option>
                  <option value="percentage">% de detecciones en ventana</option>
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontWeight: 600 }}>Tamaño de ventana (seg)</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  className="form-control"
                  value={liveWindowSizeSeconds}
                  onChange={(e) => setLiveWindowSizeSeconds(Number(e.target.value))}
                />
              </div>
              {liveDetectionMethod === "percentage" && (
                <div>
                  <label style={{ display: "block", fontWeight: 600 }}>Umbral (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    className="form-control"
                    value={livePercentageThreshold}
                    onChange={(e) => setLivePercentageThreshold(Number(e.target.value))}
                  />
                </div>
              )}
            </Card.Body>
          </Card>
          <Alert
            variant="danger"
            style={{
              display: isUndefined(errorDetails) ? "none" : "block",
            }}
          >
            Ocurrió un error{errorDetails && `: ${errorDetails}`}.{" "}
            <a href={window.location.href}>Reintentar</a>.
          </Alert>
          <ProtectionSummary
            testResults={testResults}
            webcamCoordinates={webcamCoordinates}
          />
        </Col>
      </Row>
    </>
  );

  const renderVideoUpload = () => (
    <VideoUpload />
  );

  return (
    <div className="App">
      <Header
        readyToStream={readyToStream}
        signedIn={signedIn}
        toggleRekognition={toggleRekognition}
        activeMode={activeMode}
      />
      {!window.rekognitionSettings ? (
        <SettingsHelp />
      ) : signedIn ? (
        <>
          <Navigation 
            activeMode={activeMode} 
            onModeChange={setActiveMode} 
          />
          {activeMode === "live" ? renderLiveCamera() : renderVideoUpload()}
        </>
      ) : (
        <div className="amplify-auth-container">
          <AmplifyAuthenticator usernameAlias="email">
            <AmplifySignIn
              slot="sign-in"
              usernameAlias="email"
              formFields={[
                {
                  type: "email",
                  label: "Correo electrónico *",
                  placeholder: "Correo electrónico",
                  required: true,
                  inputProps: { autoComplete: "off" },
                },
                {
                  type: "password",
                  label: "Contraseña *",
                  placeholder: "Contraseña",
                  required: true,
                  inputProps: { autoComplete: "off" },
                },
              ]}
            >
              <div slot="secondary-footer-content"></div>
            </AmplifySignIn>
          </AmplifyAuthenticator>
        </div>
      )}
    </div>
  );
};

export default App;
