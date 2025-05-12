from django.urls import re_path
from monitoring.consumers import DetectionConsumer

websocket_urlpatterns = [
    re_path(r'ws/detections/$', DetectionConsumer.as_asgi()),
] 