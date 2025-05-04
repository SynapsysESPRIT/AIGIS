from django.contrib import admin
from .models import DeepfakeDetection

@admin.register(DeepfakeDetection)
class DeepfakeDetectionAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'is_deepfake', 'confidence', 'video_url')
    list_filter = ('is_deepfake', 'timestamp')
    search_fields = ('video_url',)
    ordering = ('-timestamp',) 