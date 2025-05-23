from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import torch
import torchaudio
import torchaudio.transforms as transforms
import numpy as np
import os
import tempfile
import soundfile as sf
from pydub import AudioSegment
from pydub.exceptions import CouldntDecodeError
from transformers import HubertForSequenceClassification, Wav2Vec2FeatureExtractor
import librosa

SAMPLE_RATE = 16000
N_MELS = 128
FIXED_TIME = 128

mel_transform = transforms.MelSpectrogram(
    sample_rate=SAMPLE_RATE, n_mels=N_MELS, n_fft=2048, hop_length=512
)

class AudioRNN(torch.nn.Module):
    def __init__(self):
        super(AudioRNN, self).__init__()
        self.lstm = torch.nn.LSTM(input_size=N_MELS, hidden_size=128, num_layers=2, batch_first=True)
        self.fc = torch.nn.Linear(128, 2)
        self.dropout = torch.nn.Dropout(0.5)

    def forward(self, x):
        x, _ = self.lstm(x.squeeze(1))
        x = self.fc(self.dropout(x[:, -1, :]))
        return x

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models', 'audio_rnn_model1.pth')
model = AudioRNN()
model.load_state_dict(torch.load(MODEL_PATH, map_location=torch.device('cpu')))
model.eval()

# Load sentiment analysis model and feature extractor
sentiment_model = HubertForSequenceClassification.from_pretrained(
    "superb/hubert-large-superb-er",
    num_labels=4
)
sentiment_model.load_state_dict(torch.load(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models', 'audio_hubert_sentiment_analysis.pth')))
sentiment_model.eval()

feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained("superb/hubert-large-superb-er")

id2label = {
    0: "angry",
    1: "happy",
    2: "sad",
    3: "neutral"
}

def predict_emotion(audio_path):
    speech, sr = librosa.load(audio_path, sr=16000, mono=True)
    inputs = feature_extractor(
        speech,
        sampling_rate=16000,
        return_tensors="pt",
        padding=True
    )
    with torch.no_grad():
        outputs = sentiment_model(**inputs)
    probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
    pred_id = torch.argmax(probs).item()
    return {
        "emotion": id2label[pred_id],
        "confidence": round(probs[0][pred_id].item() * 100, 2),
        "probabilities": {id2label[i]: round(float(prob), 4) for i, prob in enumerate(probs[0])}
    }

@csrf_exempt
def infer_audio(request):
    if request.method == 'POST':
        if not request.FILES.get('audio'):
            return JsonResponse({'error': 'No audio file provided'}, status=400)
        audio_file = request.FILES['audio']
        temp_audio_path = None
        temp_audio_path_wav = None
        try:
            with tempfile.NamedTemporaryFile(delete=False) as temp_audio:
                for chunk in audio_file.chunks():
                    temp_audio.write(chunk)
                temp_audio_path = temp_audio.name
            if not temp_audio_path.endswith('.wav'):
                audio = AudioSegment.from_file(temp_audio_path)
                temp_audio_path_wav = temp_audio_path + '.wav'
                audio.export(temp_audio_path_wav, format='wav')
                os.remove(temp_audio_path)
                temp_audio_path = temp_audio_path_wav
            waveform, sample_rate = torchaudio.load(temp_audio_path, format='wav')
            waveform = torchaudio.functional.resample(waveform, orig_freq=sample_rate, new_freq=SAMPLE_RATE)
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
            mel_spec = mel_transform(waveform).squeeze(0)
            mel_spec = torchaudio.transforms.AmplitudeToDB()(mel_spec)
            if mel_spec.shape[1] < FIXED_TIME:
                pad = FIXED_TIME - mel_spec.shape[1]
                mel_spec = torch.nn.functional.pad(mel_spec, (0, pad))
            else:
                mel_spec = mel_spec[:, :FIXED_TIME]
            mel_spec = mel_spec.unsqueeze(0).unsqueeze(0)
            with torch.no_grad():
                output = model(mel_spec)
                softmax = torch.nn.Softmax(dim=1)
                probs = softmax(output)
                real_prob = probs[0][0].item()
                fake_prob = probs[0][1].item()

            # Sentiment analysis
            sentiment_result = predict_emotion(temp_audio_path)

            return JsonResponse({
                'real_prob': real_prob,
                'fake_prob': fake_prob,
                'sentiment': sentiment_result
            })
        except CouldntDecodeError:
            return JsonResponse({'error': 'Invalid audio file or ffmpeg not installed'}, status=400)
        except Exception as e:
            return JsonResponse({'error': f'Error processing audio file: {str(e)}'}, status=400)
        finally:
            if temp_audio_path and os.path.exists(temp_audio_path):
                try:
                    os.remove(temp_audio_path)
                except PermissionError:
                    pass
            if temp_audio_path_wav and os.path.exists(temp_audio_path_wav):
                try:
                    os.remove(temp_audio_path_wav)
                except PermissionError:
                    pass
    return JsonResponse({'error': 'Invalid request'}, status=400)
