import cv2
import numpy as np
from flask import Flask, Response, jsonify, render_template, request
import os

app = Flask(__name__)

# ==========================================
# CONFIGURAÇÕES E ESTADOS GLOBAIS
# ==========================================
current_camera_index = 0
camera = None
current_roi = None  # Formato: {'x': int, 'y': int, 'w': int, 'h': int}
current_mode = "train"  # 'train' (Treinamento) ou 'use' (Operação)

# Arquivos de histograma salvos no disco
HIST_CORRETO_PATH = "hist_correto.npy"
HIST_ERRADO_PATH = "hist_errado.npy"

def get_camera(index):
    """Inicializa ou troca o dispositivo de vídeo ativo."""
    global camera
    if camera is not None:
        camera.release()
    camera = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    if not camera.isOpened():
        camera = cv2.VideoCapture(index)
        
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
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
    if ref_type not in ['correto', 'errado']:
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
    
    # Calcula o histograma de cores da amostra e salva no disco
    hist = calcular_histograma(roi_crop)
    filename = HIST_CORRETO_PATH if ref_type == 'correto' else HIST_ERRADO_PATH
    np.save(filename, hist)

    return jsonify({"status": "success", "message": f"Padrão de Cor '{ref_type.upper()}' salvo com sucesso!"})

@app.route('/api/reset_memory', methods=['POST'])
def reset_memory():
    """Apaga os histogramas salvos, resetando a memória."""
    global current_mode
    deleted_count = 0
    
    if os.path.exists(HIST_CORRETO_PATH):
        os.remove(HIST_CORRETO_PATH)
        deleted_count += 1
    if os.path.exists(HIST_ERRADO_PATH):
        os.remove(HIST_ERRADO_PATH)
        deleted_count += 1
        
    current_mode = "train"
    return jsonify({
        "status": "success", 
        "message": f"Memória resetada! {deleted_count} padrões de cor apagados."
    })

# ==========================================
# PROCESSAMENTO DE VÍDEO POR COR EM TEMPO REAL
# ==========================================

def generate_frames():
    global camera, current_roi, current_mode
    
    while True:
        if camera is None or not camera.isOpened():
            break
        success, frame = camera.read()
        if not success:
            break
        else:
            has_refs = os.path.exists(HIST_CORRETO_PATH) and os.path.exists(HIST_ERRADO_PATH)
            
            if current_mode == 'use' and has_refs and current_roi:
                x, y, w, h = current_roi['x'], current_roi['y'], current_roi['w'], current_roi['h']
                h_img, w_img, _ = frame.shape
                x = max(0, min(x, w_img))
                y = max(0, min(y, h_img))
                w = min(w, w_img - x)
                h = min(h, h_img - y)
                
                if w > 10 and h > 10:
                    roi_live = frame[y:y+h, x:x+w]
                    gray_live = cv2.cvtColor(roi_live, cv2.COLOR_BGR2GRAY)
                    
                    # Se a esteira estiver limpa (baixo desvio padrão), classifica como VAZIO
                    if gray_live.std() < 10:
                        label_text = "VAZIO"
                        color = (128, 128, 128)
                    else:
                        # Carrega os histogramas padrão salvos
                        hist_correto = np.load(HIST_CORRETO_PATH)
                        hist_errado = np.load(HIST_ERRADO_PATH)
                        
                        # Calcula o histograma do objeto que está passando agora
                        hist_live = calcular_histograma(roi_live)
                        
                        # Compara usando correlação de histogramas (método CORREL: 1.0 é idêntico)
                        score_c = cv2.compareHist(hist_correto, hist_live, cv2.HISTCMP_CORREL)
                        score_e = cv2.compareHist(hist_errado, hist_live, cv2.HISTCMP_CORREL)
                        
                        print(f"[LOG COR] Match Correto: {score_c:.2f} | Match Errado: {score_e:.2f}")
                        
                        # Limiar mínimo de semelhança de cor (0.45 a 0.50 costuma ser ideal para cores)
                        THRESHOLD = 0.45
                        
                        if score_c < THRESHOLD and score_e < THRESHOLD:
                            label_text = "INCERTO / OUTRO"
                            color = (0, 165, 255) # Laranja
                        elif score_c > score_e:
                            label_text = f"CORRETO ({int(score_c*100)}%)"
                            color = (0, 200, 0) # Verde
                        else:
                            label_text = f"ERRADO ({int(score_e*100)}%)"
                            color = (0, 0, 220) # Vermelho

                    cv2.rectangle(frame, (15, 15), (310, 55), (0, 0, 0), -1)
                    cv2.putText(frame, f"STATUS: {label_text}", (22, 42), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.60, color, 2, cv2.LINE_AA)

            if current_roi:
                x, y, w, h = current_roi['x'], current_roi['y'], current_roi['w'], current_roi['h']
                border_color = (0, 255, 255) if current_mode == 'train' else (255, 165, 0)
                cv2.rectangle(frame, (x, y), (x + w, y + h), border_color, 2)

            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)