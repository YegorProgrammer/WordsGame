document.addEventListener('DOMContentLoaded', init);

// ===================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
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
// 2. ИНИЦИАЛИЗАЦИЯ И НАСТРОЙКА
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
    ui = { /* ... */ };
    Object.assign(ui, { startButton: document.getElementById('startButton'), endButton: document.getElementById('endButton'), pauseButton: document.getElementById('pauseButton'), hintButton: document.getElementById('hintButton'), statusDiv: document.getElementById('status'), sphere: document.getElementById('sphere'), loadingOverlay: document.getElementById('loading-overlay') });
    audio = { /* ... */ };
    Object.assign(audio, { music: document.getElementById('audio-music'), correct: document.getElementById('audio-correct'), error: document.getElementById('audio-error'), hint: document.getElementById('audio-hint'), win: document.getElementById('audio-win'), milestone: document.getElementById('audio-milestone') });
    audio.music.volume = 0.1;
    Object.keys(audio).forEach(key => { if (key !== 'music') audio[key].volume = 0.4; });
    
    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
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

    ui.sphere.addEventListener('mousedown', handleSpherePress);
    ui.sphere.addEventListener('mouseup', handleSphereRelease);
    ui.sphere.addEventListener('touchstart', handleSpherePress, { passive: true });
    ui.sphere.addEventListener('touchend', handleSphereRelease);
    
    setSphereAnimation('idle');
    ui.loadingOverlay.style.opacity = '0';
    setTimeout(() => ui.loadingOverlay.style.display = 'none', 500);
}

// ===================================================================
// 3. ОСНОВНАЯ ИГРОВАЯ ЛОГИКА
// ===================================================================

function setSphereAnimation(className) {
    ui.sphere.className = className || 'idle';
}

function handleSpherePress() {
    if (isGameRunning && !isSpeaking && !isListening && ui.sphere.classList.contains('waiting')) {
        startListening();
    }
}

function handleSphereRelease() {
    if (isListening) {
        // Немедленно обновляем UI, не дожидаясь ответа от API распознавания
        setSphereAnimation('idle'); 
        ui.statusDiv.textContent = 'Секунду...';

        isListening = false;
        // Асинхронно останавливаем прослушивание
        stopListening();
        // waitForInput()
    }
}

function waitForInput() {
    stopListening();
    setSphereAnimation('waiting');
    ui.statusDiv.textContent = 'Ваш ход. Зажмите, чтобы говорить.';
}

function speak(text, callback) {
    if (isSpeaking) return;
    stopListening();
    isSpeaking = true;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU'; utterance.rate = 1.1; utterance.volume = 1.0;
    utterance.onend = () => {
        setTimeout(() => {
            isSpeaking = false;
            setSphereAnimation('idle');
            if (callback) callback();
        }, 300);
    };
    window.speechSynthesis.speak(utterance);
}

function startListening() {
    if (!isGameRunning || isSpeaking || isListening) return;
    isListening = true;
    setSphereAnimation('listening'); 
    ui.statusDiv.textContent = 'Слушаю... Отпустите, когда закончите.';
    try { recognition.start(); } catch (e) { isListening = false; }
}

function stopListening() {
    if (isListening) {
        recognition.stop();
    }
}

function computerTurn() {
    stopListening();
    setSphereAnimation('thinking');
    ui.statusDiv.textContent = 'Думаю...';
    
    setTimeout(() => {
        if (!isGameRunning) return;
        const availableWords = (dictionary[lastLetter] || []).filter(w => !usedWords.has(w));
        if (availableWords.length === 0) { handleWin('player'); return; }
        
        const word = availableWords[Math.floor(Math.random() * availableWords.length)];
        processNewWord(word, 'computer');
        checkMilestone(() => speak(word, waitForInput));
    }, 1200);
}

function handleRecognitionResult(event) {
    const result = event.results[event.results.length - 1][0];
    
    setSphereAnimation('idle');
    ui.statusDiv.textContent = 'Обрабатываю ответ...';
    
    if (result.confidence < 0.7) {
        handleMistake("Не удалось распознать слово. Попробуйте еще раз.");
        return;
    }

    if (isSpeaking) return;

    const userWord = result.transcript.trim().toLowerCase().replace('.', '');
    if (userWord.split(' ').length > 1) { return; }
    if (usedWords.has(userWord)) { handleMistake("Такое слово уже было."); return; }
    if (userWord.charAt(0) !== lastLetter) {
        handleMistake(`Неправильно. Слово должно быть на букву ${lastLetter.toUpperCase()}.`);
        return;
    }
    
    audio.correct.play();
    processNewWord(userWord, 'player');
    checkMilestone(computerTurn);
}

function handleRecognitionEnd() {
    isListening = fetch;
    waitForInput();
}

function handleMistake(message) {
    stopListening();
    audio.error.play();
    setSphereAnimation('effect-error');
    speak(message, waitForInput);
}

function provideHint() {
    if (!isGameRunning || hintCooldown || isSpeaking) return;
    stopListening();
    hintCooldown = true;
    ui.hintButton.disabled = true;
    
    audio.hint.play();
    setSphereAnimation('effect-hint');
    
    const hintWords = (dictionary[lastLetter] || []).filter(w => !usedWords.has(w));
    const message = hintWords.length > 0 ? `Вот подсказка: ${hintWords[0]}` : `У меня нет подсказок!`;
    
    speak(message, waitForInput);
    setTimeout(() => { hintCooldown = false; if (isGameRunning) ui.hintButton.disabled = false; }, 5000);
}

function handleWin(winner) {
    const wasRunning = isGameRunning;
    endGame();
    if (!wasRunning) return;
    
    jsConfetti.addConfetti({ emojis: ['🏆', '✨', '🥇'] });
    audio.win.play();
    setSphereAnimation('effect-win');
    ui.sphere.style.cursor = 'default';
    const message = winner === 'player' ? "Мне нечего сказать. Твоя победа! Поздравляю!" : "Я победил! В следующий раз повезёт!";
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
    speak(`Начинаем! Мое первое слово: ${firstWord}`, waitForInput);
}

function endGame() {
    isGameRunning = false;
    isSpeaking = false;
    stopListening();
    window.speechSynthesis.cancel();
}

function resetGame() {
    usedWords.clear(); lastSpoken = {}; lastLetter = ''; hintCooldown = false;
    ui.hintButton.disabled = false;
    ui.pauseButton.classList.remove('resume-mode'); ui.pauseButton.textContent = 'Пауза';
    setSphereAnimation('idle');
    ui.sphere.style.cursor = 'default';
}

function resetUI() {
    endGame();
    audio.music.pause(); audio.music.currentTime = 0;
    
    [ui.pauseButton, ui.hintButton, ui.endButton].forEach(btn => { btn.classList.add('hidden'); btn.disabled = false; });
    ui.pauseButton.classList.remove('resume-mode'); ui.pauseButton.textContent = 'Пауза';
    ui.startButton.classList.remove('hidden'); ui.startButton.textContent = "Сыграть ещё раз";
    setSphereAnimation('idle');
    ui.statusDiv.textContent = 'Готов сыграть снова!';
}

function togglePause() {
    if (!isGameRunning) return;
    const isNowPaused = ui.pauseButton.classList.toggle('resume-mode');
    setSphereAnimation('idle');

    if (isNowPaused) {
        stopListening();
        ui.sphere.style.cursor = 'default';
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
            else waitForInput();
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
        setSphereAnimation('effect-milestone');
        jsConfetti.addConfetti({ emojis: ['🎉', '🎊', '🎈'] });
        audio.milestone.play();
        speak(`Ух ты, уже ${usedWords.size} слов!`, nextTurn);
    } else {
        nextTurn();
    }
}

function handleRecognitionError(e) {
    isListening = false;
    // Если речь не была распознана (в т.ч. из-за тишины), корректно возвращаемся в режим ожидания.
    if (e.error === 'no-speech' || e.error === 'audio-capture') {
        waitForInput();
    }
    console.error(`Ошибка распознавания: ${e.error}`);
}