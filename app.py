import cv2
import numpy as np
from flask import Flask, Response, jsonify, render_template, request, send_file
import os
import sys
import time
import threading
import webbrowser

# ==========================================
# CONFIGURAÇÃO DE DIRETÓRIOS E COMPATIBILIDADE PYINSTALLER
# ==========================================
if getattr(sys, 'frozen', False):
    # Executando empacotado em .exe (PyInstaller)
    template_dir = os.path.join(sys._MEIPASS, 'templates')
    app = Flask(__name__, template_folder=template_dir)
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    # Execução normal via script Python
    app = Flask(__name__)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ==========================================
# CONFIGURAÇÕES E ESTADOS GLOBAIS
# ==========================================
current_camera_index = 0
camera = None
current_roi = None  # Formato: {'x': int, 'y': int, 'w': int, 'h': int}
current_mode = "train"  # 'train' (Treinamento) ou 'use' (Operação)

# Arquivos de histograma e imagens de referência salvos no disco
HIST_CORRETO_PATH = os.path.join(BASE_DIR, "hist_correto.npy")
HIST_ERRADO_PATH = os.path.join(BASE_DIR, "hist_errado.npy")
HIST_VAZIO_PATH = os.path.join(BASE_DIR, "hist_vazio.npy")

IMG_CORRETO_PATH = os.path.join(BASE_DIR, "ref_correto.jpg")
IMG_ERRADO_PATH = os.path.join(BASE_DIR, "ref_errado.jpg")
IMG_VAZIO_PATH = os.path.join(BASE_DIR, "ref_vazio.jpg")

# Cache em memória RAM dos histogramas para altíssima performance
cached_hist_correto = None
cached_hist_errado = None
cached_hist_vazio = None

# Variáveis de retenção de status (Latch / Pulse Stretcher para esteiras rápidas)
last_detected_status = "VAZIO"
last_detected_color = (128, 128, 128)
last_detected_time = 0
LATCH_DURATION = 1.2  # Mantém o status na tela por 1.2s após detectar a passagem do frango

# Contadores de inspeção da esteira (Frango Bom vs Frango Ruim)
stats = {
    "corretos": 0,
    "errados": 0,
    "total": 0
}

def load_cached_histograms():
    """Carrega os histogramas para a memória RAM para evitar leituras lentas de disco por frame."""
    global cached_hist_correto, cached_hist_errado, cached_hist_vazio
    
    for path, var_name in [
        (HIST_CORRETO_PATH, 'cached_hist_correto'),
        (HIST_ERRADO_PATH, 'cached_hist_errado'),
        (HIST_VAZIO_PATH, 'cached_hist_vazio')
    ]:
        val = None
        if os.path.exists(path):
            try:
                val = np.load(path)
            except Exception:
                val = None
        if var_name == 'cached_hist_correto':
            cached_hist_correto = val
        elif var_name == 'cached_hist_errado':
            cached_hist_errado = val
        elif var_name == 'cached_hist_vazio':
            cached_hist_vazio = val

load_cached_histograms()

class VideoStreamThread:
    """Thread 1: Captura contínua de hardware em segundo plano.
    Elimina o buffer atrasado da webcam e garante que o sistema sempre
    tenha o frame mais recente em 0ms."""
    def __init__(self, src=0):
        self.src = src
        self.stream = None
        self.grabbed = False
        self.frame = None
        self.stopped = False
        self.lock = threading.Lock()
        self.init_camera()

    def init_camera(self):
        if self.stream is not None:
            try:
                self.stream.release()
            except Exception:
                pass
        self.stream = cv2.VideoCapture(self.src, cv2.CAP_DSHOW)
        if not self.stream.isOpened():
            self.stream = cv2.VideoCapture(self.src)
            
        self.stream.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.stream.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.stream.set(cv2.CAP_PROP_FPS, 60)
        self.stream.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        self.grabbed, self.frame = self.stream.read()
        self.stopped = False
        self.thread = threading.Thread(target=self.update, daemon=True)
        self.thread.start()

    def update(self):
        while not self.stopped:
            if self.stream is None or not self.stream.isOpened():
                time.sleep(0.02)
                continue
            grabbed, frame = self.stream.read()
            if grabbed:
                with self.lock:
                    self.grabbed = grabbed
                    self.frame = frame
            else:
                time.sleep(0.005)

    def read(self):
        with self.lock:
            if self.frame is not None:
                return self.grabbed, self.frame.copy()
            return False, None

    def isOpened(self):
        return self.stream is not None and self.stream.isOpened()

    def release(self):
        self.stopped = True
        if self.stream is not None:
            try:
                self.stream.release()
            except Exception:
                pass

def get_camera(index):
    """Inicializa ou troca o dispositivo de vídeo ativo usando thread paralela."""
    global camera
    if camera is not None:
        camera.release()
    camera = VideoStreamThread(index)
    return camera

get_camera(current_camera_index)

# ==========================================
# FUNÇÃO DE EXTRAÇÃO DE HISTOGRAMA HSV
# ==========================================
def calcular_histograma(roi_img):
    """Calcula o histograma de cores HSV normalizado da ROI."""
    hsv = cv2.cvtColor(roi_img, cv2.COLOR_BGR2HSV)
    # Foca nos canais de Matiz (Hue=0) e Saturação (Saturation=1) para ignorar variações leves de luz
    hist = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
    return hist

# ==========================================
# ROTAS HTTP (API E INTERFACE)
# ==========================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/cameras')
def list_cameras():
    available_cameras = []
    for i in range(5):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                available_cameras.append(i)
            cap.release()
            
    get_camera(current_camera_index)
    
    has_refs = os.path.exists(HIST_CORRETO_PATH) and os.path.exists(HIST_ERRADO_PATH)
    return jsonify({
        "cameras": available_cameras, 
        "current": current_camera_index,
        "mode": current_mode,
        "has_references": has_refs
    })

@app.route('/api/set_camera/<int:cam_id>', methods=['POST'])
def set_camera(cam_id):
    global current_camera_index
    current_camera_index = cam_id
    get_camera(current_camera_index)
    return jsonify({"status": "success", "active_camera": current_camera_index})

@app.route('/api/set_mode', methods=['POST'])
def set_mode():
    global current_mode
    data = request.json
    mode = data.get('mode')
    
    if mode in ['train', 'use']:
        has_refs = os.path.exists(HIST_CORRETO_PATH) and os.path.exists(HIST_ERRADO_PATH)
        if mode == 'use' and not has_refs:
            return jsonify({
                "status": "error", 
                "message": "Você precisa salvar os padrões de cor (Correto e Errado) antes de entrar em Operação!"
            }), 400
        current_mode = mode
        return jsonify({"status": "success", "mode": current_mode})
        
    return jsonify({"status": "error", "message": "Modo inválido."}), 400

@app.route('/api/set_roi', methods=['POST'])
def set_roi():
    global current_roi
    data = request.json
    if data.get('clear'):
        current_roi = None
        return jsonify({"status": "success", "message": "Área de inspeção redefinida."})
    
    try:
        current_roi = {
            'x': int(data['x']),
            'y': int(data['y']),
            'w': int(data['w']),
            'h': int(data['h'])
        }
        return jsonify({"status": "success", "roi": current_roi})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/save_reference/<ref_type>', methods=['POST'])
def save_reference(ref_type):
    global camera, current_roi
    if ref_type not in ['correto', 'errado', 'vazio']:
        return jsonify({"status": "error", "message": "Tipo de referência inválido."}), 400
        
    if camera is None or not camera.isOpened():
        return jsonify({"status": "error", "message": "Câmera indisponível."}), 400
    
    success, frame = camera.read()
    if not success:
        return jsonify({"status": "error", "message": "Falha ao capturar imagem."}), 400

    if not current_roi:
        return jsonify({"status": "error", "message": "Desenhe a Área de Inspeção (ROI) primeiro!"}), 400

    x, y, w, h = current_roi['x'], current_roi['y'], current_roi['w'], current_roi['h']
    h_img, w_img, _ = frame.shape
    x = max(0, min(x, w_img))
    y = max(0, min(y, h_img))
    w = min(w, w_img - x)
    h = min(h, h_img - y)

    if w < 15 or h < 15:
        return jsonify({"status": "error", "message": "Área selecionada muito pequena."}), 400

    roi_crop = frame[y:y+h, x:x+w]
    
    # Define caminhos conforme o tipo de padrão
    if ref_type == 'correto':
        img_filename = IMG_CORRETO_PATH
        filename = HIST_CORRETO_PATH
        nome_padrao = "FRANGO BOM"
    elif ref_type == 'errado':
        img_filename = IMG_ERRADO_PATH
        filename = HIST_ERRADO_PATH
        nome_padrao = "FRANGO RUIM"
    else:
        img_filename = IMG_VAZIO_PATH
        filename = HIST_VAZIO_PATH
        nome_padrao = "ESTEIRA VAZIA"

    # Salva imagem para visualização
    cv2.imwrite(img_filename, roi_crop)

    # Calcula histograma de cores e salva
    hist = calcular_histograma(roi_crop)
    np.save(filename, hist)

    # Atualiza cache em memória RAM
    load_cached_histograms()

    return jsonify({
        "status": "success", 
        "message": f"Padrão '{nome_padrao}' salvo com sucesso!",
        "has_image": True
    })

@app.route('/api/reference_image/<ref_type>')
def get_reference_image(ref_type):
    """Retorna a foto salva da referência para exibição na interface."""
    mapping = {
        'correto': IMG_CORRETO_PATH,
        'errado': IMG_ERRADO_PATH,
        'vazio': IMG_VAZIO_PATH
    }
    if ref_type not in mapping:
        return ("Tipo inválido", 400)
        
    img_filename = mapping[ref_type]
    if os.path.exists(img_filename):
        return send_file(img_filename, mimetype='image/jpeg', max_age=0)
    return ("Imagem não encontrada", 404)

@app.route('/api/stats')
def get_stats():
    """Retorna estatísticas da esteira e status atual em tempo real."""
    has_refs = (cached_hist_correto is not None) and (cached_hist_errado is not None)
    
    if current_mode == 'use':
        if time.time() - last_detected_time < LATCH_DURATION:
            curr = last_detected_status
        else:
            curr = "VAZIO"
    else:
        curr = "TREINAMENTO"

    return jsonify({
        "stats": stats,
        "current_status": curr,
        "mode": current_mode,
        "has_correto": os.path.exists(IMG_CORRETO_PATH),
        "has_errado": os.path.exists(IMG_ERRADO_PATH),
        "has_vazio": os.path.exists(IMG_VAZIO_PATH),
        "has_references": has_refs
    })

@app.route('/api/reset_stats', methods=['POST'])
def reset_stats():
    """Zera os contadores de frangos da esteira."""
    global stats
    stats = {"corretos": 0, "errados": 0, "total": 0}
    return jsonify({"status": "success", "stats": stats})

@app.route('/api/reset_memory', methods=['POST'])
def reset_memory():
    """Apaga os histogramas e fotos salvas, resetando a memória."""
    global current_mode, last_detected_status, stats
    deleted_count = 0
    
    arquivos = [
        HIST_CORRETO_PATH, HIST_ERRADO_PATH, HIST_VAZIO_PATH,
        IMG_CORRETO_PATH, IMG_ERRADO_PATH, IMG_VAZIO_PATH
    ]
    for path in arquivos:
        if os.path.exists(path):
            try:
                os.remove(path)
                deleted_count += 1
            except Exception:
                pass
                
    load_cached_histograms()
    last_detected_status = "VAZIO"
    stats = {"corretos": 0, "errados": 0, "total": 0}
    current_mode = "train"
    return jsonify({
        "status": "success", 
        "message": f"Memória resetada! {deleted_count} arquivos apagados."
    })

# ==========================================
# PROCESSAMENTO DE VÍDEO POR COR EM TEMPO REAL
# ==========================================

# ==========================================
# THREAD 2: INSPEÇÃO EM TEMPO REAL DE ALTA VELOCIDADE
# ==========================================

def inspection_worker():
    """Thread 2: Roda de forma independente em alta frequência (~100-200 checagens/segundo).
    Usa amostragem de pico durante toda a passagem do frango e rejeição de borda,
    evitando que a ponta do frango ao entrar na ROI cause falso registro."""
    global camera, current_roi, current_mode
    global last_detected_status, last_detected_color, last_detected_time, stats
    
    in_passage = False
    counted_in_this_passage = False
    max_score_c = 0.0
    max_score_e = 0.0
    empty_frames_count = 0
    
    # Limiares calibrados para visão industrial
    THRESHOLD_BASE = 0.42       # Limiar mínimo de correlação
    MIN_CONFIRM_SCORE = 0.55    # Score mínimo para confirmação com alta certeza no centro
    MIN_MARGIN = 0.10           # Margem de diferença mínima entre bom e ruim
    
    while True:
        if camera is None or not camera.isOpened():
            time.sleep(0.03)
            continue
            
        if current_mode != 'use':
            time.sleep(0.03)
            continue
            
        has_refs = (cached_hist_correto is not None) and (cached_hist_errado is not None)
        if not has_refs or not current_roi:
            time.sleep(0.02)
            continue
            
        success, frame = camera.read()
        if not success or frame is None:
            time.sleep(0.005)
            continue
            
        x, y, w, h = current_roi['x'], current_roi['y'], current_roi['w'], current_roi['h']
        h_img, w_img, _ = frame.shape
        x = max(0, min(x, w_img))
        y = max(0, min(y, h_img))
        w = min(w, w_img - x)
        h = min(h, h_img - y)
        
        if w > 10 and h > 10:
            roi_live = frame[y:y+h, x:x+w]
            hist_live = calcular_histograma(roi_live)
            
            score_c = cv2.compareHist(cached_hist_correto, hist_live, cv2.HISTCMP_CORREL)
            score_e = cv2.compareHist(cached_hist_errado, hist_live, cv2.HISTCMP_CORREL)
            
            score_v = -1.0
            if cached_hist_vazio is not None:
                score_v = cv2.compareHist(cached_hist_vazio, hist_live, cv2.HISTCMP_CORREL)

            # REJEIÇÃO DE BORDA:
            # Se a esteira vazia ainda tiver correlação forte (> 0.65) e nenhum padrão de frango tiver
            # certeza alta (> 0.58), a ROI ainda é quase toda esteira (apenas a ponta do frango entrou).
            is_vazio = False
            if cached_hist_vazio is not None and score_v > 0.65 and max(score_c, score_e) < MIN_CONFIRM_SCORE:
                is_vazio = True
            elif cached_hist_vazio is not None and score_v > score_c and score_v > score_e:
                is_vazio = True
            elif score_c < THRESHOLD_BASE and score_e < THRESHOLD_BASE:
                is_vazio = True
                
            if is_vazio:
                empty_frames_count += 1
                
                # Quando a esteira fica livre por 3 frames consecutivos:
                if empty_frames_count >= 3:
                    # Se houve passagem de frango que ainda não havia sido confirmada:
                    # (Ex: esteira muito veloz onde o frango cruzou em poucos milissegundos)
                    if in_passage and not counted_in_this_passage:
                        diff = max_score_c - max_score_e
                        if max_score_c >= THRESHOLD_BASE and diff >= 0:
                            stats["corretos"] += 1
                            stats["total"] += 1
                            last_detected_status = f"FRANGO BOM ({int(max_score_c * 100)}%)"
                            last_detected_color = (0, 200, 0)
                            last_detected_time = time.time()
                        elif max_score_e >= THRESHOLD_BASE and diff < 0:
                            stats["errados"] += 1
                            stats["total"] += 1
                            last_detected_status = f"FRANGO RUIM ({int(max_score_e * 100)}%)"
                            last_detected_color = (0, 0, 220)
                            last_detected_time = time.time()
                            
                    # Reseta os acumuladores para o próximo frango
                    in_passage = False
                    counted_in_this_passage = False
                    max_score_c = 0.0
                    max_score_e = 0.0
            else:
                # O frango está dentro da ROI!
                empty_frames_count = 0
                in_passage = True
                
                # Acumula as pontuações máximas da passagem completa
                if score_c > max_score_c:
                    max_score_c = score_c
                if score_e > max_score_e:
                    max_score_e = score_e
                
                # GATILHO DE ALTA CERTEZA:
                # Só confirma o contador quando o frango está bem posicionado e há margem clara de vitória
                if not counted_in_this_passage:
                    if score_c >= MIN_CONFIRM_SCORE and (score_c - score_e) >= MIN_MARGIN:
                        stats["corretos"] += 1
                        stats["total"] += 1
                        counted_in_this_passage = True
                        last_detected_status = f"FRANGO BOM ({int(score_c * 100)}%)"
                        last_detected_color = (0, 200, 0)
                        last_detected_time = time.time()
                    elif score_e >= MIN_CONFIRM_SCORE and (score_e - score_c) >= MIN_MARGIN:
                        stats["errados"] += 1
                        stats["total"] += 1
                        counted_in_this_passage = True
                        last_detected_status = f"FRANGO RUIM ({int(score_e * 100)}%)"
                        last_detected_color = (0, 0, 220)
                        last_detected_time = time.time()
                    else:
                        # Fase de aproximação / indeciso na borda: mostra análise ao vivo sem gravar no contador
                        if score_c >= score_e:
                            last_detected_status = f"ANALISANDO: BOM ({int(score_c * 100)}%)"
                            last_detected_color = (0, 200, 0)
                        else:
                            last_detected_status = f"ANALISANDO: RUIM ({int(score_e * 100)}%)"
                            last_detected_color = (0, 0, 220)
                        last_detected_time = time.time()
                else:
                    # Já contado para este frango: mantém status atualizado no display
                    if score_c >= score_e:
                        last_detected_status = f"FRANGO BOM ({int(score_c * 100)}%)"
                        last_detected_color = (0, 200, 0)
                    else:
                        last_detected_status = f"FRANGO RUIM ({int(score_e * 100)}%)"
                        last_detected_color = (0, 0, 220)
                    last_detected_time = time.time()

        time.sleep(0.005)

# Inicia a thread de inspeção em segundo plano
threading.Thread(target=inspection_worker, daemon=True).start()

# ==========================================
# THREAD 3: STREAMING DE VÍDEO (HTTP FLASK)
# ==========================================

def generate_frames():
    """Thread 3: Apenas renderiza os placares e envia os frames JPEG para o navegador.
    Mesmo que o navegador engasgue ou a conexão seja lenta, a inspeção da Thread 2 continua voando."""
    global camera, current_roi, current_mode
    global last_detected_status, last_detected_color, last_detected_time, stats
    
    while True:
        if camera is None or not camera.isOpened():
            time.sleep(0.05)
            continue
            
        success, frame = camera.read()
        if not success or frame is None:
            time.sleep(0.01)
            continue

        # Renderiza status e contadores na imagem
        if current_mode == 'use':
            if time.time() - last_detected_time < LATCH_DURATION:
                display_status = last_detected_status
                display_color = last_detected_color
            else:
                display_status = "ESTEIRA VAZIA"
                display_color = (140, 140, 140)

            # Tarja 1: STATUS
            cv2.rectangle(frame, (15, 12), (370, 48), (0, 0, 0), -1)
            cv2.putText(frame, f"STATUS: {display_status}", (22, 37), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.58, display_color, 2, cv2.LINE_AA)

            # Tarja 2: PLACAR DE CONTADORES (Frango Bom vs Frango Ruim)
            cv2.rectangle(frame, (15, 54), (370, 86), (20, 25, 35), -1)
            cv2.putText(frame, f"BOM: {stats['corretos']}   RUIM: {stats['errados']}   TOTAL: {stats['total']}", 
                        (22, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (245, 245, 245), 1, cv2.LINE_AA)

        if current_roi:
            x, y, w, h = current_roi['x'], current_roi['y'], current_roi['w'], current_roi['h']
            border_color = (0, 255, 255) if current_mode == 'train' else (255, 165, 0)
            cv2.rectangle(frame, (x, y), (x + w, y + h), border_color, 2)

        # Comprime para JPEG e envia para o navegador
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def open_browser():
    """Abre o navegador automaticamente após inicialização do servidor."""
    time.sleep(1.5)
    webbrowser.open('http://localhost:5000')

if __name__ == '__main__':
    print("=" * 65)
    print(" SISTEMA DE INSPEÇÃO INDUSTRIAL - ESTEIRA INTELIGENTE")
    print(" Servidor iniciado com sucesso!")
    print(" Acesse no navegador: http://localhost:5000")
    print("=" * 65)
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=False)