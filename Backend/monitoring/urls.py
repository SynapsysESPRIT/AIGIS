from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard_view, name='dashboard'),
    path('login/', views.login_view, name='login'),
    path('activity/', views.get_activity_data, name='get_activity'),
    path('add-child/', views.add_child, name='add_child'),
    path('log-activity/', views.log_activity, name='log_activity'),
    path('children/', views.children_list, name='children_list'),
    path('log-detection/', views.log_detection, name='log_detection'),
    path('detection-data/', views.get_detection_data, name='get_detection_data'),
    path('usage-pattern/', views.get_usage_pattern_data, name='get_usage_pattern_data'),
] 