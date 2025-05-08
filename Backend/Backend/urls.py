from django.contrib import admin
from django.urls import path, include
from chatbot import views as chatbot_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('video/', include('video.urls')),
    path('image/', include('image.urls')),
    path('text/', include('text.urls')),
    path('audio/', include('audio.urls')),
    path('chatbot/', chatbot_views.chatbot_view, name='chatbot'),
]
