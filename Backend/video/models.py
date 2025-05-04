from django.db import models

# Create your models here.

class DeepfakeDetection(models.Model):
    is_deepfake = models.BooleanField()
    confidence = models.FloatField()
    video_url = models.URLField(max_length=2000, blank=True)
    model_used = models.CharField(max_length=50, default='xception')
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{'Deepfake' if self.is_deepfake else 'Real'} ({self.confidence:.2%}) - {self.model_used}"

    class Meta:
        ordering = ['-timestamp']
