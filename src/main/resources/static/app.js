/* ==========================================================================
   Astra Sports AI - Frontend Client Logic
   ========================================================================== */

// Global State
let currentUser = null;
let activeScreen = 'auth-screen';
let studentsList = [];
let selectedStudent = null;
let currentExercise = 'Squats';

// MediaPipe & Camera Recording State
let pose = null;
let camera = null;
let mediaRecorder = null;
let recordedChunks = [];
let isTrackingActive = false;
let isRecording = false;

// Squat Logic Variables
let squatCount = 0;
let squatState = 'up'; // 'up' or 'down'
let currentKneeAngle = 180;
let assessmentTimer = 15;
let timerInterval = null;

// DOM Elements
const toastElement = document.getElementById('toast');
const webcamElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const mlLoadingElement = document.getElementById('ml-loading');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupAuthForms();
    initializePoseModel();
});

// Check Session on Load
async function checkSession() {
    try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
            currentUser = await response.json();
            navigateDashboard();
        } else {
            showScreen('auth-screen');
        }
    } catch (e) {
        showScreen('auth-screen');
    }
}

// Setup Form Listeners
function setupAuthForms() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                currentUser = data;
                showToast('Welcome back, ' + currentUser.name + '!', 'success');
                navigateDashboard();
            } else {
                showToast(data.error || 'Login failed', 'error');
            }
        } catch (err) {
            showToast('Connection failed. Is server running?', 'error');
        }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const role = document.getElementById('reg-role').value;
        
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, role })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Registration successful! Please log in.', 'success');
                switchAuthTab('login');
            } else {
                showToast(data.error || 'Registration failed', 'error');
            }
        } catch (err) {
            showToast('Registration error', 'error');
        }
    });

    document.getElementById('add-student-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('name', document.getElementById('std-name').value);
        formData.append('age', document.getElementById('std-age').value);
        formData.append('height', document.getElementById('std-height').value);
        formData.append('weight', document.getElementById('std-weight').value);
        formData.append('aadhaarNumber', document.getElementById('std-aadhaar-num').value);
        
        const fileInput = document.getElementById('std-aadhaar-doc');
        if (fileInput.files.length > 0) {
            formData.append('aadhaarDoc', fileInput.files[0]);
        }

        try {
            const res = await fetch('/api/students', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Athlete registered successfully!', 'success');
                closeAddStudentModal();
                loadCoachStudents();
            } else {
                showToast(data.error || 'Failed to add student', 'error');
            }
        } catch (err) {
            showToast('Error uploading student details', 'error');
        }
    });
}

// Session Router Navigation
function navigateDashboard() {
    if (!currentUser) return showScreen('auth-screen');
    
    if (currentUser.role === 'COACH') {
        document.getElementById('coach-name').innerText = currentUser.name;
        showScreen('coach-dashboard');
        loadCoachStudents();
    } else if (currentUser.role === 'SAI_AUTHORITY') {
        document.getElementById('sai-name').innerText = currentUser.name;
        showScreen('sai-dashboard');
        loadSaiDashboard();
    }
}

// Log Out
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        showToast('Logged out successfully', 'success');
        showScreen('auth-screen');
    } catch (e) {
        showScreen('auth-screen');
    }
}

// Swappers & UI Utility helpers
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
    });
    const next = document.getElementById(screenId);
    if (next) {
        next.classList.add('active');
        activeScreen = screenId;
    }
}

function switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });

    if (tab === 'login') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('login-form').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('register-form').classList.add('active');
    }
}

// Toast System
function showToast(message, type = 'info') {
    toastElement.className = `toast show ${type}`;
    toastElement.innerHTML = `
        <i class="fa-solid ${
            type === 'success' ? 'fa-circle-check text-green' : 
            type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'
        }"></i>
        <span>${message}</span>
    `;
    setTimeout(() => {
        toastElement.classList.remove('show');
    }, 4000);
}

// Drag & Drop label upload preview
function handleFileChange(event) {
    const file = event.target.files[0];
    const label = document.getElementById('file-label');
    if (file) {
        label.innerText = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    } else {
        label.innerText = "Choose File or Drag & Drop";
    }
}

// ==================== COACH OPERATIONS ====================
async function loadCoachStudents() {
    try {
        const res = await fetch('/api/students');
        if (res.ok) {
            studentsList = await res.json();
            renderStudentsGrid();
        }
    } catch (e) {
        showToast('Error loading student profiles', 'error');
    }
}

function renderStudentsGrid() {
    const grid = document.getElementById('students-grid');
    const emptyState = document.getElementById('coach-empty-state');
    grid.innerHTML = '';

    if (studentsList.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    studentsList.forEach(student => {
        const docLink = student.aadhaarDocPath 
            ? `<a href="/${student.aadhaarDocPath}" target="_blank" class="detail-val link">View Document <i class="fa-solid fa-external-link-alt"></i></a>`
            : `<span class="detail-val text-red">Missing File</span>`;

        const card = document.createElement('div');
        card.className = 'student-card';
        card.innerHTML = `
            <div class="student-card-header">
                <div>
                    <h4>${student.name}</h4>
                    <span class="student-age">${student.age} Years Old</span>
                </div>
                <button class="btn btn-icon-only" onclick="deleteStudent(${student.id})" title="Delete Athlete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="student-details-list">
                <div class="detail-row">
                    <span class="detail-lbl">Height / Weight</span>
                    <span class="detail-val">${student.height} cm / ${student.weight} kg</span>
                </div>
                <div class="detail-row">
                    <span class="detail-lbl">Aadhaar UID</span>
                    <span class="detail-val">${student.aadhaarNumber}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-lbl">Aadhaar Copy</span>
                    ${docLink}
                </div>
            </div>
            <div class="student-actions">
                <button class="btn btn-secondary" onclick="viewStudentAssessments(${student.id}, '${student.name}')">
                    <i class="fa-solid fa-history"></i> History
                </button>
                <button class="btn btn-primary" onclick="openRecorder(${student.id}, '${student.name}')">
                    <i class="fa-solid fa-video"></i> Start Test
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this athlete and all their records?')) return;
    try {
        const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Athlete profile deleted', 'success');
            loadCoachStudents();
        } else {
            showToast('Failed to delete student', 'error');
        }
    } catch (e) {
        showToast('Error performing deletion', 'error');
    }
}

// Student Modals Handlers
function openAddStudentModal() {
    document.getElementById('student-modal').classList.remove('hidden');
}
function closeAddStudentModal() {
    document.getElementById('student-modal').classList.add('hidden');
    document.getElementById('add-student-form').reset();
    document.getElementById('file-label').innerText = "Choose File or Drag & Drop";
}

// ==================== LIVE MOTION ML & VIDEO RECORDING ====================

// Initialize MediaPipe Pose
function initializePoseModel() {
    if (typeof Pose === 'undefined') {
        console.warn('Pose API script not loaded yet. Retrying...');
        setTimeout(initializePoseModel, 1000);
        return;
    }

    pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
    });

    pose.onResults(onPoseResults);
}

// Camera Feed Access
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 360, frameRate: { ideal: 30 } },
            audio: false // Exercise recording doesn't strictly need audio
        });
        webcamElement.srcObject = stream;
        webcamElement.play();

        // Canvas Setup sizes
        canvasElement.width = 640;
        canvasElement.height = 360;

        isTrackingActive = true;
        mlLoadingElement.classList.add('hidden');

        // Set up Frame sender loop manually to work smoothly
        camera = new Camera(webcamElement, {
            onFrame: async () => {
                if (isTrackingActive) {
                    await pose.send({ image: webcamElement });
                }
            },
            width: 640,
            height: 360
        });
        camera.start();

    } catch (e) {
        showToast('Webcam access denied. Camera is mandatory.', 'error');
        closeRecorder();
    }
}

function selectExercise(ex) {
    currentExercise = ex;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
}

// Modal open/close trigger
function openRecorder(studentId, studentName) {
    selectedStudent = { id: studentId, name: studentName };
    document.getElementById('assess-student-name').innerText = studentName;
    document.getElementById('recorder-modal').classList.remove('hidden');
    mlLoadingElement.classList.remove('hidden');
    document.getElementById('assessment-summary').classList.add('hidden');
    resetHUD();
    
    // Start webcam and analytics
    startCamera();
}

function closeRecorder() {
    if (isRecording) {
        stopRecording();
    }
    isTrackingActive = false;
    if (camera) {
        camera.stop();
        camera = null;
    }
    if (webcamElement.srcObject) {
        webcamElement.srcObject.getTracks().forEach(track => track.stop());
        webcamElement.srcObject = null;
    }
    clearInterval(timerInterval);
    document.getElementById('recorder-modal').classList.add('hidden');
}

function resetHUD() {
    squatCount = 0;
    squatState = 'up';
    currentKneeAngle = 180;
    assessmentTimer = 15;
    document.getElementById('hud-count').innerText = '0';
    document.getElementById('hud-angle').innerText = '180°';
    document.getElementById('hud-timer').innerText = '15s';
    document.getElementById('start-rec-btn').classList.remove('hidden');
    document.getElementById('stop-rec-btn').classList.add('hidden');
    document.getElementById('live-indicator').classList.add('hidden');
    document.getElementById('close-recorder-btn').disabled = false;
    recordedChunks = [];
}

// Recording Controls (Enforces Live Video, No Pause)
function startRecording() {
    resetHUD();
    isRecording = true;
    recordedChunks = [];

    // Capture the Canvas stream so the recorded video contains the skeleton lines overlay!
    const canvasStream = canvasElement.captureStream(25);
    
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }
    }

    mediaRecorder = new MediaRecorder(canvasStream, options);
    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = compileAssessmentSummary;
    mediaRecorder.start();

    // UI Updates
    document.getElementById('start-rec-btn').classList.add('hidden');
    document.getElementById('stop-rec-btn').classList.remove('hidden');
    document.getElementById('live-indicator').classList.remove('hidden');
    document.getElementById('close-recorder-btn').disabled = true; // Block closing while live test runs

    // Start Timer
    timerInterval = setInterval(() => {
        assessmentTimer--;
        document.getElementById('hud-timer').innerText = assessmentTimer + 's';
        if (assessmentTimer <= 0) {
            stopRecording();
        }
    }, 1000);
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(timerInterval);
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    document.getElementById('stop-rec-btn').classList.add('hidden');
    document.getElementById('live-indicator').classList.add('hidden');
    document.getElementById('close-recorder-btn').disabled = false;
}

// MediaPipe Pose Callback Loop
function onPoseResults(results) {
    if (!canvasCtx) return;

    // Clear Canvas and Draw Mirrored video frame
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        // Draw Skeleton Connections
        drawSkeleton(results.poseLandmarks);

        // Core Squat calculations: Check Knee angles
        // Landmarks: Left Hip (23), Left Knee (25), Left Ankle (27)
        // Landmarks: Right Hip (24), Right Knee (26), Right Ankle (28)
        const leftHip = results.poseLandmarks[23];
        const leftKnee = results.poseLandmarks[25];
        const leftAnkle = results.poseLandmarks[27];

        const rightHip = results.poseLandmarks[24];
        const rightKnee = results.poseLandmarks[26];
        const rightAnkle = results.poseLandmarks[28];

        if (leftHip && leftKnee && leftAnkle && rightHip && rightKnee && rightAnkle) {
            // Compute angles for both legs
            const leftAngle = findAngle(leftHip, leftKnee, leftAnkle);
            const rightAngle = findAngle(rightHip, rightKnee, rightAnkle);
            
            // Average knee angle (or pick cleanest tracker based on visibility confidence)
            currentKneeAngle = Math.round((leftAngle + rightAngle) / 2);
            document.getElementById('hud-angle').innerText = currentKneeAngle + '°';

            // Real-time Squat Tracker FSM
            if (isRecording) {
                if (currentKneeAngle < 105 && squatState === 'up') {
                    // Deep squat limit met
                    squatState = 'down';
                } else if (currentKneeAngle > 160 && squatState === 'down') {
                    // Stretched back to standing position
                    squatCount++;
                    squatState = 'up';
                    document.getElementById('hud-count').innerText = squatCount;
                    showToast(`Rep ${squatCount} Registered!`, 'info');
                }
            }
        }
    }
    canvasCtx.restore();
}

// Calculate angle between hip, knee and ankle vectors
function findAngle(hip, knee, ankle) {
    const vKneeHip = { x: hip.x - knee.x, y: hip.y - knee.y };
    const vKneeAnkle = { x: ankle.x - knee.x, y: ankle.y - knee.y };

    const dotProduct = vKneeHip.x * vKneeAnkle.x + vKneeHip.y * vKneeAnkle.y;
    const magKneeHip = Math.sqrt(vKneeHip.x * vKneeHip.x + vKneeHip.y * vKneeHip.y);
    const magKneeAnkle = Math.sqrt(vKneeAnkle.x * vKneeAnkle.x + vKneeAnkle.y * vKneeAnkle.y);

    let cosAngle = dotProduct / (magKneeHip * magKneeAnkle);
    cosAngle = Math.max(-1, Math.min(1, cosAngle)); // Clamp bounds

    return Math.acos(cosAngle) * (180 / Math.PI);
}

// Draw skeleton joints and lines
function drawSkeleton(landmarks) {
    // Select specific landmarks to draw to avoid cluttering video feed
    const joints = [23, 24, 25, 26, 27, 28, 11, 12]; // Hips, knees, ankles, shoulders
    const lines = [
        [11, 12], // Shoulders
        [11, 23], [12, 24], // Shoulders to hips
        [23, 24], // Hips line
        [23, 25], [24, 26], // Hips to knees
        [25, 27], [26, 28]  // Knees to ankles
    ];

    // Draw connection lines
    canvasCtx.strokeStyle = 'cyan';
    canvasCtx.lineWidth = 4;
    lines.forEach(pair => {
        const p1 = landmarks[pair[0]];
        const p2 = landmarks[pair[1]];
        if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
            canvasCtx.beginPath();
            canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
            canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
            canvasCtx.stroke();
        }
    });

    // Draw joints
    canvasCtx.fillStyle = 'lime';
    joints.forEach(idx => {
        const pt = landmarks[idx];
        if (pt && pt.visibility > 0.5) {
            canvasCtx.beginPath();
            canvasCtx.arc(pt.x * canvasElement.width, pt.y * canvasElement.height, 6, 0, 2 * Math.PI);
            canvasCtx.fill();
        }
    });
}

// Final compilation & scoring
function compileAssessmentSummary() {
    // Math scoring formula
    let score = 0;
    if (squatCount === 1) score = 40;
    else if (squatCount === 2) score = 70;
    else if (squatCount === 3) score = 90;
    else if (squatCount >= 4) score = 100;

    const qualified = score >= 70; // Requires >= 2 clean squats to qualify

    // Render Overlay Card details
    document.getElementById('sum-reps').innerText = squatCount;
    document.getElementById('sum-score').innerText = score + '%';
    
    const badge = document.getElementById('sum-status');
    const desc = document.getElementById('summary-desc');
    const submitBtn = document.getElementById('submit-assessment-btn');

    if (qualified) {
        badge.className = "badge badge-success";
        badge.innerText = "Qualified for SAI";
        desc.innerHTML = `Great! Athlete successfully executed <strong>${squatCount}</strong> deep squats, earning a score of <strong>${score}%</strong>. This record meets standard criteria and will be sent directly to the Sports Authority of India portal.`;
        submitBtn.classList.remove('hidden');
    } else {
        badge.className = "badge badge-danger";
        badge.innerText = "Underqualified";
        desc.innerHTML = `Athlete completed only <strong>${squatCount}</strong> deep squats (Score: <strong>${score}%</strong>), which is below the minimum threshold of 2 reps (70%) required for SAI submission. Discard and record again.`;
        submitBtn.classList.add('hidden'); // Cannot upload unqualified videos to SAI authority
    }

    document.getElementById('assessment-summary').classList.remove('hidden');
}

function retryRecording() {
    document.getElementById('assessment-summary').classList.add('hidden');
    resetHUD();
}

// Upload assessment WebM video blob and details
async function uploadAssessmentVideo() {
    if (recordedChunks.length === 0) {
        showToast('No video recorded. Please complete assessment.', 'error');
        return;
    }

    const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('video', videoBlob, 'assessment.webm');
    formData.append('score', squatCount === 1 ? 40 : squatCount === 2 ? 70 : squatCount === 3 ? 90 : 100);
    formData.append('exerciseType', currentExercise);
    formData.append('qualified', true); // Only qualified can trigger this function

    const uploadBtn = document.getElementById('submit-assessment-btn');
    uploadBtn.disabled = true;
    uploadBtn.innerText = "Uploading Record...";

    try {
        const res = await fetch(`/api/students/${selectedStudent.id}/assessments`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            showToast('Video uploaded successfully and sent to SAI!', 'success');
            closeRecorder();
            loadCoachStudents();
        } else {
            showToast('Upload failed', 'error');
            uploadBtn.disabled = false;
            uploadBtn.innerText = "Upload to SAI Portal";
        }
    } catch (e) {
        showToast('Connection error during upload', 'error');
        uploadBtn.disabled = false;
        uploadBtn.innerText = "Upload to SAI Portal";
    }
}

// View Assessment History for a Student
async function viewStudentAssessments(studentId, studentName) {
    document.getElementById('history-student-name').innerText = studentName;
    document.getElementById('assessments-list-modal').classList.remove('hidden');
    const listContainer = document.getElementById('history-list');
    listContainer.innerHTML = '<p>Loading assessments history...</p>';

    try {
        const res = await fetch(`/api/students/${studentId}/assessments`);
        if (res.ok) {
            const data = await res.json();
            listContainer.innerHTML = '';
            if (data.length === 0) {
                listContainer.innerHTML = '<p class="subtitle text-center">No assessments recorded yet for this athlete.</p>';
                return;
            }

            data.forEach(item => {
                const date = new Date(item.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const verifyBadge = item.verificationStatus === 'APPROVED' ? '<span class="badge badge-success">Approved by SAI</span>' :
                                    item.verificationStatus === 'REJECTED' ? '<span class="badge badge-danger">Rejected by SAI</span>' :
                                    '<span class="badge badge-warning">Awaiting SAI Review</span>';

                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `
                    <div class="history-item-left">
                        <div class="history-title">${item.exerciseType} Test</div>
                        <div class="history-meta">
                            <span>Date: ${date}</span>
                            <span>Score: ${item.score}%</span>
                        </div>
                    </div>
                    <div class="history-item-right">
                        ${verifyBadge}
                        <a href="/${item.videoPath}" target="_blank" class="btn btn-secondary btn-icon" style="padding: 5px 10px; font-size: 11px;">
                            Play <i class="fa-solid fa-play"></i>
                        </a>
                    </div>
                `;
                listContainer.appendChild(div);
            });
        }
    } catch (e) {
        listContainer.innerHTML = '<p class="text-red">Error fetching history.</p>';
    }
}

function closeAssessmentsList() {
    document.getElementById('assessments-list-modal').classList.add('hidden');
}

// ==================== SAI PORTAL OPERATIONS ====================
async function loadSaiDashboard() {
    const queueContainer = document.getElementById('sai-queue');
    const emptyState = document.getElementById('sai-empty-state');
    queueContainer.innerHTML = '<p>Loading pending queue...</p>';

    try {
        const res = await fetch('/api/sai/qualified');
        if (res.ok) {
            const data = await res.json();
            queueContainer.innerHTML = '';
            if (data.length === 0) {
                emptyState.classList.remove('hidden');
                return;
            }
            emptyState.classList.add('hidden');

            data.forEach(item => {
                const date = new Date(item.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                
                // Show verification indicators
                let actionSection = `
                    <button class="btn btn-danger" onclick="verifySaiRecord(${item.id}, 'REJECTED')">Reject Athlete</button>
                    <button class="btn btn-primary" onclick="verifySaiRecord(${item.id}, 'APPROVED')">Verify & Approve</button>
                `;
                if (item.verificationStatus === 'APPROVED') {
                    actionSection = `<span class="badge badge-success" style="font-size: 13px;"><i class="fa-solid fa-check-double"></i> Verified Talent (Approved)</span>`;
                } else if (item.verificationStatus === 'REJECTED') {
                    actionSection = `<span class="badge badge-danger" style="font-size: 13px;"><i class="fa-solid fa-xmark"></i> Rejected Athlete</span>`;
                }

                const docPath = item.student.aadhaarDocPath 
                    ? `<a href="/${item.student.aadhaarDocPath}" target="_blank">Download Soft Copy <i class="fa-solid fa-download"></i></a>`
                    : '<span class="text-red">No copy provided</span>';

                const card = document.createElement('div');
                card.className = 'sai-card';
                card.innerHTML = `
                    <div class="sai-video-container">
                        <video src="/${item.videoPath}" controls></video>
                    </div>
                    <div class="sai-card-details">
                        <div class="sai-details-header">
                            <div>
                                <h4>Athlete: ${item.student.name}</h4>
                                <span class="subtitle">Record Submitted: ${date}</span>
                            </div>
                            <span class="score-badge">ML Score: ${item.score}%</span>
                        </div>
                        <div class="sai-details-grid">
                            <div class="sai-group">
                                <span class="sai-lbl">Age / Height / Weight</span>
                                <span class="sai-val">${item.student.age} Yrs / ${item.student.height} cm / ${item.student.weight} kg</span>
                            </div>
                            <div class="sai-group">
                                <span class="sai-lbl">Aadhaar Verification</span>
                                <span class="sai-val">
                                    Number: ${item.student.aadhaarNumber}<br>
                                    ${docPath}
                                </span>
                            </div>
                            <div class="sai-group">
                                <span class="sai-lbl">Registered By</span>
                                <span class="sai-val">
                                    Coach: ${item.student.coach.name}<br>
                                    Email: ${item.student.coach.email}
                                </span>
                            </div>
                        </div>
                        <div class="sai-actions" id="sai-actions-${item.id}">
                            ${actionSection}
                        </div>
                    </div>
                `;
                queueContainer.appendChild(card);
            });
        }
    } catch (e) {
        queueContainer.innerHTML = '<p class="text-red">Error loading dashboard items.</p>';
    }
}

async function verifySaiRecord(id, status) {
    try {
        const res = await fetch(`/api/sai/assessments/${id}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        
        if (res.ok) {
            showToast(`Assessment record status marked as ${status}!`, 'success');
            
            // Update UI container locally without reloading whole list
            const container = document.getElementById(`sai-actions-${id}`);
            if (status === 'APPROVED') {
                container.innerHTML = `<span class="badge badge-success" style="font-size: 13px;"><i class="fa-solid fa-check-double"></i> Verified Talent (Approved)</span>`;
            } else {
                container.innerHTML = `<span class="badge badge-danger" style="font-size: 13px;"><i class="fa-solid fa-xmark"></i> Rejected Athlete</span>`;
            }
        } else {
            showToast('Failed to update status', 'error');
        }
    } catch (e) {
        showToast('Error updating database record', 'error');
    }
}
