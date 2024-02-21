let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioRecorder;
let audioList = [];
let isRecording = false;
let isPlaying = false;
let isContinuousPlayback = false; // Flag for continuous playback
let inputAudioNode;
let realTimeStream;

let playPauseAll = document.getElementById('playPauseAll');
playPauseAll.addEventListener('click', togglePlayPause);

let distortButton = document.getElementById('distortButton'); // Add this line
distortButton.addEventListener('click', distortAudio); // Add this line

let undoDistortButton = document.getElementById('undoDistortButton'); // Add this line
undoDistortButton.addEventListener('click', undoDistortAudio); // Add this line

let audioSource; // To keep track of the currently playing audio source

let distortionNode; // Add this line

function togglePlayPause() {
    if (audioList.length > 0) {
        if (!isPlaying) {
            startPlaying();
        } else {
            pausePlayingAll();
            undoDistortAudio(); // Disconnect distortion when pausing
        }
    }
}

function startPlaying() {
    isPlaying = true;
    isContinuousPlayback = true; // Enable continuous playback

    if (!audioSource) {
        playAudio(audioList[0]); // Play the first audio when starting
        playPauseAll.textContent = 'Pause All';
    } else {
        // Pause the audio context and resume it after a short delay to ensure proper synchronization
        audioContext.suspend().then(() => {
            setTimeout(() => {
                audioContext.resume().then(() => {
                    playPauseAll.textContent = 'Pause All';
                });
            }, 100);
        });
    }
}

function pausePlayingAll() {
    isPlaying = false;
    if (audioSource) {
        audioContext.suspend().then(() => {
            playPauseAll.textContent = 'Play All';
        });
    }
}

async function playAudio(audioURL) {
    try {
        await audioContext.resume();
        const buffer = await createBuffer(audioURL);

        if (buffer) {
            audioSource = audioContext.createBufferSource();
            audioSource.buffer = buffer;
            applyDistortion(audioSource); // Apply distortion if enabled

            // Create a new input audio node for real-time monitoring
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            inputAudioNode = audioContext.createMediaStreamSource(stream);

            // Connect to the audio context destination only when recording
            if (isRecording) {
                inputAudioNode.connect(audioContext.destination);
            }

            audioSource.connect(audioContext.destination);

            audioSource.onended = () => {
                if (isContinuousPlayback) {
                    playContinuously(); // Restart playback
                } else {
                    isPlaying = false;
                    playPauseAll.textContent = 'Play All';
                }
            };

            audioSource.start(0);
            playPauseAll.textContent = 'Pause All';
        }
    } catch (error) {
        console.error('Error during playback:', error);
    }
}

function applyDistortion(source) {
    if (distortionNode) {
        source.disconnect();
        source.connect(distortionNode);
        distortionNode.connect(audioContext.destination);
    }
}

function createBuffer(audioURL) {
    return new Promise((resolve, reject) => {
        fetch(audioURL)
            .then(response => response.arrayBuffer())
            .then(data => audioContext.decodeAudioData(data))
            .then(buffer => {
                resolve(buffer);
            })
            .catch(error => {
                console.error('Error loading audio:', error);
                reject(error);
            });
    });
}
document.getElementById('recordButton').addEventListener('click', toggleRecording);

function toggleRecording() {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
        undoDistortAudio(); // Disconnect distortion when stopping recording
    }
}

function startRecording() {
    isRecording = true;

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
            audioRecorder = new MediaRecorder(stream);

            // Disconnect and set inputAudioNode to null before creating a new one
            if (inputAudioNode) {
                inputAudioNode.disconnect();
                inputAudioNode = null;
            }            

            // Create a new input audio node for real-time monitoring
            inputAudioNode = audioContext.createMediaStreamSource(stream);

            // Connect to the audio context destination only when recording
            if (isRecording) {
                inputAudioNode.connect(audioContext.destination);
            }

            // Reconnect the input audio node for real-time monitoring
            inputAudioNode.connect(audioContext.destination);

            audioRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    const audioBlob = event.data;
                    const audioURL = URL.createObjectURL(audioBlob);
                    audioList.push(audioURL);
                    updateAudioList();
                }
            };

            audioRecorder.onstop = () => {
                if (!isPlaying) {
                    startPlaying();
                }

                // Disconnect the input audio node when recording stops
                if (inputAudioNode) {
                    inputAudioNode.disconnect();
                    inputAudioNode = null;
                }

                // Update the record button text
                document.getElementById('recordButton').textContent = 'Record';
            };

            audioRecorder.start();
            // Update the record button text
            document.getElementById('recordButton').textContent = 'Stop Recording';
            document.getElementById('recordButton').classList.add('recording');
            document.getElementById('resetButton').disabled = false;
        })
        .catch((error) => {
            console.error('Error accessing microphone:', error);
        });
}


function stopRecording() {
    isRecording = false;
    if (audioRecorder) {
        audioRecorder.stop();
    }
    // Update the record button text
    document.getElementById('recordButton').textContent = 'Record';
    document.getElementById('recordButton').classList.remove('recording');

    // Disconnect the input audio node when recording stops
    if (inputAudioNode) {
        inputAudioNode.disconnect();
        inputAudioNode = null;
    }

    // Automatically play the recordings after stopping recording
    playContinuously();
}

function playAudioInRealTime(audioURL) {
    audioContext.resume().then(async () => {
        const buffer = await createBuffer(audioURL);

        if (buffer) {
            const realTimeSource = audioContext.createBufferSource();
            realTimeSource.buffer = buffer;
            applyDistortion(realTimeSource); // Apply distortion if enabled
            realTimeSource.connect(audioContext.destination);
            realTimeSource.start(0);
        }
    });
}



function distortAudio() {
    if (audioSource && !distortionNode) {
        // Create a distortion node
        distortionNode = audioContext.createWaveShaper();
        distortionNode.curve = makeDistortionCurve(100); // Adjust the distortion amount
        distortionNode.oversample = '4x';

        applyDistortion(audioSource);

        document.getElementById('undoDistortButton').disabled = false;
        document.getElementById('distortButton').disabled = true;
    }
}

function undoDistortAudio() {
    if (audioSource && distortionNode) {
        // Disconnect the distortion node
        distortionNode.disconnect();
        distortionNode = null;

        applyDistortion(audioSource); // Reapply distortion if enabled

        document.getElementById('undoDistortButton').disabled = true;
        document.getElementById('distortButton').disabled = false;
    }
}

// Helper function to create a distortion curve
function makeDistortionCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < samples; ++i) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }

    return curve;
}

async function playSimultaneously() {
    return new Promise(async (resolve) => {
        audioContext.resume().then(async () => {
            const masterGainNode = audioContext.createGain();
            masterGainNode.connect(audioContext.destination);

            const bufferSources = await Promise.all(audioList.map(audioURL => createBufferSource(audioURL, masterGainNode)));

            const validSources = bufferSources.filter(source => source && source.buffer);

            if (validSources.length > 0) {
                const longestDuration = Math.max(...validSources.map(getBufferSourceDuration));

                validSources.reduce((previousSource, currentSource, index) => {
                    previousSource.connect(currentSource);
                    if (index === validSources.length - 1) {
                        currentSource.onended = () => {
                            if (isContinuousPlayback) {
                                playSimultaneously().then(resolve); // Restart playback
                            } else {
                                resolve();
                            }
                        };
                    }
                    return currentSource;
                }, masterGainNode);

                validSources.forEach(source => source.start(0));

                setTimeout(() => {
                    validSources.forEach(source => {
                        source.stop(audioContext.currentTime + longestDuration);
                        source.disconnect();
                    });
                }, longestDuration * 1000);
            } else {
                resolve();
            }
        });
    });
}

function playContinuously() {
    playSimultaneously()
        .then(() => {
            if (isContinuousPlayback) {
                playContinuously(); // Restart playback
            } else {
                isPlaying = false;
            }
        })
        .catch((error) => {
            console.error('Error playing audio continuously:', error);
        });
}


function getBufferSourceDuration(source) {
    return new Promise((resolve, reject) => {
        if (source && source.buffer) {
            resolve(source.buffer.duration);
        } else {
            reject(new Error('Invalid source or buffer'));
        }
    });
}

function createBufferSource(audioURL, masterGainNode) {
    return new Promise((resolve, reject) => {
        const source = audioContext.createBufferSource();

        fetch(audioURL)
            .then(response => response.arrayBuffer())
            .then(data => audioContext.decodeAudioData(data))
            .then(buffer => {
                source.buffer = buffer;
                applyDistortion(source); // Apply distortion if enabled
                source.connect(masterGainNode);

                source.onended = () => {
                    resolve();
                };

                source.start(0);
            })
            .catch(error => {
                console.error('Error loading audio:', error);
                reject(error);
            });
    });
}

// AUDIO LIST

// Initialize an array to track the play/pause state of each audio source
let isPlayingArray = new Array(audioList.length).fill(false);

function updateAudioList() {
    const audioListContainer = document.getElementById('audioList');
    audioListContainer.innerHTML = '';

    audioList.forEach((audioURL, index) => {
        const audioContainer = document.createElement('div');
        audioContainer.className = 'audio-container';

        // Create a span for the audio label (track name)
        const audioLabel = document.createElement('span');
        audioLabel.textContent = `Audio ${index + 1}`;

        // Create a delete button for each audio source
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>'; // Use trash icon for delete button

        deleteButton.addEventListener('click', () => {
            deleteAudioAtIndex(index);
        });

        // Add both the audio label and delete button to the container
        audioContainer.appendChild(audioLabel);
        audioContainer.appendChild(deleteButton);

        // Set the display property of the container to inline-flex
        audioContainer.style.display = 'inline-flex';

        audioListContainer.appendChild(audioContainer);
    });
}


function deleteAudioAtIndex(index) {
    if (index >= 0 && index < audioList.length) {
        // Remove the audio URL at the specified index
        audioList.splice(index, 1);
        isPlayingArray.splice(index, 1);

        // Update the audio list
        updateAudioList();

        // Pause playback if it's ongoing and there are no more audio items
        if (isPlaying && audioList.length === 0) {
            pausePlayingAll();
        }

        // Reload the page if there are no more audio items
        if (audioList.length === 0) {
            location.reload();
        }
    }
}

async function togglePlayPauseAtIndex(index, button) {
    if (audioList.length > 0 && index >= 0 && index < audioList.length) {
        const currentAudioSource = audioSource[index];

        if (currentAudioSource) {
            if (isPlayingArray[index]) {
                // Pause the currently playing audio
                currentAudioSource.pause();
                button.innerHTML = '<i class="fas fa-play"></i>'; // Change button icon to "play"
            } else {
                // If paused or no audio is playing, start playing the selected track
                await currentAudioSource.play();
                button.innerHTML = '<i class="fas fa-pause"></i>'; // Change button icon to "pause"
            }

            // Toggle the play/pause state in the array
            isPlayingArray[index] = !isPlayingArray[index];
        }
    }
}


// Add the following line to add an event listener for the record button
document.getElementById('recordButton').addEventListener('click', toggleRecording);

// Add the following line to add an event listener for the reset button
document.getElementById('resetButton').addEventListener('click', resetAudioArray);


// Function to set up real-time monitoring
function setupRealTimeMonitoring() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
            // Save the real-time stream for later cleanup
            realTimeStream = stream;
            // Create a new input audio node for real-time monitoring
            inputAudioNode = audioContext.createMediaStreamSource(stream);
            // Connect to the audio context destination only when recording
            if (isRecording) {
                inputAudioNode.connect(audioContext.destination);
            }
        })
        .catch((error) => {
            console.error('Error accessing microphone:', error);
        });
}



// Add the resetAudioArray function
// Add the resetAudioArray function
function resetAudioArray() {
    // Clear the recorded audio list
    audioList = [];
    isContinuousPlayback = false;

    // Disconnect and set inputAudioNode to null
    if (inputAudioNode) {
        inputAudioNode.disconnect();
        inputAudioNode = null;
    }

    // Disconnect the real-time stream if it exists
    if (realTimeStream) {
        realTimeStream.getTracks().forEach(track => track.stop());
        realTimeStream = null;
    }

    // Update the audio list
    updateAudioList();

    // Disable the reset button
    document.getElementById('resetButton').disabled = true;

    // Pause playback if it's ongoing
    if (isPlaying) {
        pausePlayingAll();
    }

    // Reload the page
    location.reload();
}


    // Play the first audio after a short delay
// Play the first audio after a short delay
setTimeout(() => {
    if (audioList.length > 0) {
        // Set up real-time monitoring
        setupRealTimeMonitoring();

        // Play the first audio
        playAudio(audioList[0]);
    } else {
        // If there are no audio recordings, set up real-time monitoring without playing
        setupRealTimeMonitoring();
    }
}, 100); // Adjust the delay as needed