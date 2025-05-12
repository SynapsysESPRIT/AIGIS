from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from chatbot import views as chatbot_views
from monitoring import views as monitoring_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('video/', include('video.urls')),
    path('image/', include('image.urls')),
    path('text/', include('text.urls')),
    path('audio/', include('audio.urls')),
    path('chatbot/', chatbot_views.chatbot_view, name='chatbot'),
    path('monitoring/', include('monitoring.urls')),
    path('login/', monitoring_views.login_view, name='login'),
    path('logout/', monitoring_views.logout_view, name='logout'),
] + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
