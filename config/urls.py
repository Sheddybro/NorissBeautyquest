from django.contrib import admin
from django.contrib.auth.views import LoginView,LogoutView
from django.urls import path
from shop import views
urlpatterns=[path('receipts/<uuid:receipt_id>/',views.receipt_view,name='receipt'),path('admin/',admin.site.urls),path('accounts/login/',LoginView.as_view(template_name='registration/login.html'),name='login'),path('accounts/logout/',LogoutView.as_view(),name='logout'),path('',views.dashboard,name='dashboard'),path('offline-shell/',views.offline_shell,name='offline-shell'),path('sw.js',views.service_worker,name='service-worker'),path('manifest.webmanifest',views.manifest,name='manifest'),path('api/bootstrap/',views.bootstrap,name='bootstrap'),path('api/operations/',views.operation,name='operation'),path('api/owner/staff/',views.owner_staff,name='owner-staff'),path('api/owner/settings/',views.owner_settings,name='owner-settings'),path('health/',views.health,name='health')]
