document.addEventListener('DOMContentLoaded', init);

// ===================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЯ
// ===================================================================
let dictionary = {};
let ui, audio, recognition, jsConfetti;

let isGameRunning = false;
let isListening = false;
let isSpeaking = false;
let hintCooldown = false;

let usedWords = new Set();
let lastSpoken = {};
let lastLetter = '';

// ===================================================================
// 2. ФУНКЦИИ ИНИЦИАЛИЗАЦИИ И НАСТРОЙКИ
// ===================================================================
async function init() {
    try {
        const response = await fetch('dictionary.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        dictionary = await response.json();
        setup();
    } catch (error) {
        document.getElementById('status').textContent = "Ошибка загрузки словаря.";
    }
}

function setup() {
    ui = {
        startButton: document.getElementById('startButton'),
        pauseButton: document.getElementById('pauseButton'),
        hintButton: document.getElementById('hintButton'),
        endButton: document.getElementById('endButton'),
        statusDiv: document.getElementById('status'),
        sphere: document.getElementById('sphere'),
        loadingOverlay: document.getElementById('loading-overlay')
    };
    audio = {
        music: document.getElementById('audio-music'), correct: document.getElementById('audio-correct'),
        error: document.getElementById('audio-error'), hint: document.getElementById('audio-hint'),
        win: document.getElementById('audio-win'), milestone: document.getElementById('audio-milestone')
    };
    audio.music.volume = 0.1;
    Object.keys(audio).forEach(key => { if (key !== 'music') audio[key].volume = 0.3; });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = handleRecognitionResult;
    recognition.onend = handleRecognitionEnd;
    recognition.onerror = handleRecognitionError;

    jsConfetti = new JSConfetti();

    ui.startButton.addEventListener('click', startGame);
    ui.pauseButton.addEventListener('click', togglePause);
    ui.hintButton.addEventListener('click', provideHint);
    ui.endButton.addEventListener('click', confirmEndGame);
    
    setSphereAnimation('idle'); // Устанавливаем базовое состояние

    ui.loadingOverlay.style.opacity = '0';
    setTimeout(() => ui.loadingOverlay.style.display = 'none', 500);
}


// ===================================================================
// 3. ОСНОВНАЯ ИГРОВАЯ ЛОГИКА
// ===================================================================

function setSphereAnimation(className) {
    // Теперь это единственный способ управлять внешним видом сферы
    ui.sphere.className = className || 'idle';
}

function speak(text, callback) {
    if (isSpeaking) return;
    stopListening();
    isSpeaking = true;
    setSphereAnimation('idle');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU'; utterance.rate = 1.1; utterance.volume = 1.0;
    utterance.onend = () => {
        setTimeout(() => {
            isSpeaking = false;
            if (callback) callback();
        }, 300);
    };
    window.speechSynthesis.speak(utterance);
}

function startListening() {
    if (!isGameRunning || isSpeaking) return;
    isListening = true;
    setSphereAnimation('listening');
    ui.statusDiv.textContent = 'Слушаю тебя...';
    try { recognition.start(); } catch (e) { /* Игнор */ }
}

function stopListening() {
    isListening = false;
    if (recognition) recognition.stop();
    setSphereAnimation('idle');
}

function computerTurn() {
    stopListening();
    ui.statusDiv.textContent = 'Думаю...';
    setSphereAnimation('thinking');

    setTimeout(() => {
        if (!isGameRunning) return;
        const availableWords = (dictionary[lastLetter] || []).filter(w => !usedWords.has(w));
        if (availableWords.length === 0) {
            handleWin('player');
            return;
        }
        const word = availableWords[Math.floor(Math.random() * availableWords.length)];
        processNewWord(word, 'computer');
        checkMilestone(() => speak(word, startListening));
    }, 1200);
}

function handleRecognitionResult(event) {
    if (!isListening || isSpeaking) return;
    const result = event.results[0][0];
    if (result.confidence < 0.5 || result.transcript.trim().split(' ').length > 1) return;
    
    const userWord = result.transcript.trim().toLowerCase().replace('.', '');
    if (usedWords.has(userWord)) { handleMistake("Такое слово уже было."); return; }
    if (userWord.charAt(0) !== lastLetter) { handleMistake(`Неправильно. Слово на букву '${lastLetter}'.`); return; }
    
    audio.correct.play();
    processNewWord(userWord, 'player');
    checkMilestone(computerTurn);
}

function handleMistake(message) {
    stopListening();
    audio.error.play();
    setSphereAnimation('effect-error');
    speak(message, () => {
        startListening();
    });
}

function provideHint() {
    if (!isListening || hintCooldown) return;
    hintCooldown = true;
    ui.hintButton.disabled = true;
    stopListening();
    
    audio.hint.play();
    setSphereAnimation('effect-hint');
    
    const hintWords = (dictionary[lastLetter] || []).filter(w => !usedWords.has(w));
    const message = hintWords.length > 0 ? `Вот подсказка: ${hintWords[0]}` : `У меня нет подсказок!`;
    
    speak(message, () => {
        startListening();
    });
    
    setTimeout(() => { hintCooldown = false; if (isGameRunning) ui.hintButton.disabled = false; }, 5000);
}

function handleWin(winner) {
    const wasRunning = isGameRunning;
    endGame();
    if (!wasRunning) return;
    
    jsConfetti.addConfetti({ emojis: ['🏆', '✨', '🥇'] });
    audio.win.play();
    setSphereAnimation('effect-win');
    const message = winner === 'player' ? "Ты победил! Поздравляю!" : "Я победил! В следующий раз повезёт!";
    ui.statusDiv.textContent = message;
    speak(message, resetUI);
}

// ===================================================================
// 4. УПРАВЛЕНИЕ ИГРОЙ И КНОПКАМИ
// ===================================================================
function startGame() {
    resetGame();
    isGameRunning = true;
    
    ui.startButton.classList.add('hidden');
    [ui.pauseButton, ui.hintButton, ui.endButton].forEach(btn => btn.classList.remove('hidden'));
    
    audio.music.play();
    const firstWord = dictionary['а'][Math.floor(Math.random() * dictionary['а'].length)];
    processNewWord(firstWord, 'computer');
    speak(`Начинаем! Мое первое слово: ${firstWord}`, startListening);
}

function endGame() {
    isGameRunning = false;
    isListening = false;
    isSpeaking = false;
    stopListening();
    window.speechSynthesis.cancel();
}

function resetGame() {
    usedWords.clear();
    lastSpoken = {};
    lastLetter = '';
    hintCooldown = false;
    ui.hintButton.disabled = false;
    ui.pauseButton.classList.remove('resume-mode');
    ui.pauseButton.textContent = 'Пауза';
    setSphereAnimation('idle');
}

function resetUI() {
    endGame();
    audio.music.pause();
    audio.music.currentTime = 0;
    
    [ui.pauseButton, ui.hintButton, ui.endButton].forEach(btn => {
        btn.classList.add('hidden');
        btn.disabled = false;
    });
    ui.pauseButton.classList.remove('resume-mode');
    ui.pauseButton.textContent = 'Пауза';
    ui.startButton.classList.remove('hidden');
    ui.startButton.textContent = "Сыграть ещё раз";
    setSphereAnimation('idle');
    ui.statusDiv.textContent = 'Готов сыграть снова!';
}

function togglePause() {
    if (!isGameRunning) return;
    const isNowPaused = ui.pauseButton.classList.toggle('resume-mode');
    
    if (isNowPaused) {
        stopListening();
        window.speechSynthesis.cancel();
        audio.music.pause();
        ui.pauseButton.textContent = 'Продолжить';
        ui.statusDiv.textContent = 'Игра на паузе';
    } else {
        audio.music.play();
        ui.pauseButton.textContent = 'Пауза';
        const whoSpoke = lastSpoken.by === 'player' ? 'ты' : 'я';
        const resumeMessage = `Продолжаем. Последнее слово было "${lastSpoken.word}", его сказал ${whoSpoke}.`;
        speak(resumeMessage, () => {
            if (lastSpoken.by === 'player') computerTurn();
            else startListening();
        });
    }
}

function confirmEndGame() {
    if (!isGameRunning || ui.pauseButton.classList.contains('resume-mode')) return;
    togglePause();
    setTimeout(() => {
        if (confirm("Вы уверены, что хотите сдаться?")) {
            handleWin('computer');
        } else {
            togglePause();
        }
    }, 100);
}

// ===================================================================
// 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И ОБРАБОТЧИКИ API
// ===================================================================
function processNewWord(word, by) {
    usedWords.add(word);
    lastSpoken = { word, by };
    lastLetter = word.slice(-1);
    const invalidLastChars = ['ь', 'ъ', 'ы'];
    if (invalidLastChars.includes(lastLetter)) {
        lastLetter = word.slice(-2, -1);
    }
}

function checkMilestone(nextTurn) {
    if (usedWords.size > 0 && usedWords.size % 25 === 0) {
        jsConfetti.addConfetti({ emojis: ['🎉', '🎊', '🎈'] });
        audio.milestone.play();
        speak(`Ух ты, уже ${usedWords.size} слов!`, nextTurn);
    } else {
        nextTurn();
    }
}

function handleRecognitionEnd() {
    if (isListening) {
        startRecognition();
    }
}

function handleRecognitionError(e) {
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error(`Ошибка распознавания: ${e.error}`);
    }
}

// ===================================================================
// 6. ЗАПУСК ПРОГРАММЫ
// ===================================================================
document.addEventListener('DOMContentLoaded', init);