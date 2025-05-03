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

# Define hyperparameters
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

# Load the model
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models', 'audio_rnn_model1.pth')
model = AudioRNN()
model.load_state_dict(torch.load(MODEL_PATH, map_location=torch.device('cpu')))
model.eval()

@csrf_exempt
def infer_audio(request):
    if request.method == 'POST':
        if not request.FILES.get('audio'):
            return JsonResponse({'error': 'No audio file provided'}, status=400)

        audio_file = request.FILES['audio']
        temp_audio_path = None
        temp_audio_path_wav = None

        try:
            # Save the uploaded file to a temporary location
            with tempfile.NamedTemporaryFile(delete=False) as temp_audio:
                for chunk in audio_file.chunks():
                    temp_audio.write(chunk)
                temp_audio_path = temp_audio.name

            # Check and convert the file to .wav format if necessary
            if not temp_audio_path.endswith('.wav'):
                audio = AudioSegment.from_file(temp_audio_path)
                temp_audio_path_wav = temp_audio_path + '.wav'
                audio.export(temp_audio_path_wav, format='wav')
                os.remove(temp_audio_path)
                temp_audio_path = temp_audio_path_wav

            # Load the audio file using torchaudio
            waveform, sample_rate = torchaudio.load(temp_audio_path, format='wav')

            # Resample the audio
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

            return JsonResponse({
                'real_prob': real_prob,
                'fake_prob': fake_prob
            })

        except CouldntDecodeError:
            return JsonResponse({'error': 'Invalid audio file or ffmpeg not installed'}, status=400)
        except Exception as e:
            return JsonResponse({'error': f'Error processing audio file: {str(e)}'}, status=400)
        finally:
            # Clean up temporary files
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