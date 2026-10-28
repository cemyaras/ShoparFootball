# Shopar Football

Kısa futbol pozisyonlarına odaklanan, HTML5 Canvas tabanlı oynanabilir bir prototip. Oyuncuyu sürekli hareket ettirmek yerine topa yön, güç, falso ve yükseklik vererek pozisyonları tamamlarsınız.

Vanilla JavaScript, HTML ve CSS kullanır. Harici kütüphane, oyun motoru, görsel dosyası, backend veya derleme adımı gerektirmez. Oyun arayüzü İngilizcedir.

## Çalıştırma

`index.html` dosyasını güncel bir tarayıcıda açın. Oyun doğrudan dosyadan çalışır; internet bağlantısı gerekmez.

İsterseniz proje klasöründe Python 3 ile yerel bir sunucu da başlatabilirsiniz:

```bash
python3 -m http.server 8000
```

Ardından [localhost:8000](http://localhost:8000) adresini açın. Sunucuyu durdurmak için terminalde `Ctrl+C` kullanın.

Telefon veya tabletten denemek için cihazı bilgisayarla aynı yerel ağa bağlayın ve tarayıcıda `http://BILGISAYARIN_YEREL_IP_ADRESI:8000` adresini açın. Bilgisayarın güvenlik duvarının bağlantıya izin vermesi gerekebilir.

## Kontroller

Tüm oyun tek parmakla veya farenin sol tuşuyla oynanır. Klavye gerekmez.

1. **Tap to Play** ile başlayın.
2. Pozisyon sırasında **SHOOT** veya **PASS** seçin.
3. Topun yakınından başlayarak geriye sürükleyin. Top, sürüklemenin ters yönüne gider; daha uzun sürükleme daha fazla güç verir.
4. Bıraktığınızda büyük top üzerinde vuruş noktasını seçin:
   - **Merkez:** Düz vuruş.
   - **Sol taraf:** Sağa doğru falso.
   - **Sağ taraf:** Sola doğru falso.
   - **Alt taraf:** Daha fazla yükseklik.
   - **Üst taraf:** Daha alçak vuruş.
5. Vuruşun sonucunu izleyin ve **Next highlight** ile devam edin.

Vuruş noktasını seçmek için altı saniyeniz vardır. Süre dolarsa daha zayıf ve isabetsiz bir vuruş yapılır. Pası takım arkadaşınız aldığında kontrol ona geçer; şut çekebilir veya tekrar pas verebilirsiniz.

Top karşılama pozisyonunda sahada gitmek istediğiniz noktaya dokunun. Futbolcunuz otomatik hareket eder; top gelmeden doğru konuma ulaşmaya çalışın.

**Restart** mevcut pozisyonu ve o pozisyonda kazanılan istatistikleri sıfırlar. Beş pozisyonun sonunda goller, başarılı paslar, kaçan fırsatlar ve performans puanı gösterilir. **Play Again** yeni bir oturum başlatır. Üstteki ses düğmesiyle oyun seslerini açıp kapatabilirsiniz.

## Pozisyonlar

| Pozisyon | Amaç |
| --- | --- |
| One on one | Kaleciyle karşı karşıya kalıp köşeyi bulmak. |
| From distance | Ceza sahası dışından güçlü ve isabetli bir şut çekmek. |
| The through ball | Boşluğa pas verip alıcı oyuncuyla hücumu sürdürmek. |
| Two against two | İki savunmacıya karşı pas veya şut tercih etmek. |
| Read the game | Gelen pası karşılayıp ardından şut fırsatı yaratmak. |

Kaleci şutları kurtarabilir, savunmacılar pasları kesebilir ve şutları engelleyebilir. Falso ve yükseklik top fiziğini gerçekten etkiler; şutlar dışarı veya üstten auta gidebilir.

## Dosya yapısı

```text
ShoparFootball/
├── index.html     # Sayfa, oyun alanı ve arayüz
├── style.css      # Masaüstü, telefon ve tablet düzenleri
├── game.js        # Durum makinesi, giriş, fizik, yapay zekâ ve çizim
├── .editorconfig  # Ortak metin biçimlendirme ayarları
├── .gitignore     # Yerel ve geçici dosya istisnaları
└── README.md
```

## Geliştirme

Dosyaları düzenleyip tarayıcıyı yenilemeniz yeterlidir. `npm install` veya bir derleme komutu çalıştırmanız gerekmez.

`game.js`, oyun mantığı ile çizimi ayrı metotlarda tutar. Dünya koordinatları sabittir; ekran boyutuna göre çizim ve işaretçi koordinatları dönüştürülür. Dokunmatik ve fare girdileri aynı Pointer Events akışını kullanır.

Oyunun durumları:

```text
TITLE → HIGHLIGHT_INTRO → AIMING → BALL_CONTACT → BALL_IN_MOTION → RESULT
                         ↑                          │
                         └──── başarılı pas ────────┘

HIGHLIGHT_INTRO → INTERCEPTION → AIMING veya RESULT
RESULT → sonraki pozisyon veya SESSION_SUMMARY
```

## Doğrulama

Projede kalıcı bir otomatik test paketi bulunmaz. Node.js kuruluysa JavaScript sözdizimini kontrol edebilirsiniz:

```bash
node --check game.js
```

Manuel kontrol için:

- Fare ve dokunmatik girişle oyunu başlatın, yön ve gücü değiştirerek vuruş yapın.
- Büyük topun iki yanına ve alt/üst kısmına dokunarak falso ile yüksekliğin değiştiğini gözlemleyin.
- Kalecinin kurtarış yapabildiğini, köşe şutlarının gol olabildiğini ve hatalı şutların dışarı çıkabildiğini kontrol edin.
- Takım arkadaşına pas verin; kontrolün alıcıya geçtiğini ve savunmanın pas kesebildiğini kontrol edin.
- Beşinci pozisyonda gelen pası karşılayın; bir denemede de bilerek kaçırın.
- Vuruş seçimi süresinin dolmasını ve sürükleme hareketinin iptal edilmesini deneyin.
- **Restart**, beş pozisyonun tamamı, sonuç ekranı ve **Play Again** akışlarını kontrol edin.
- Telefon/tablet boyutlarında, dikey ve yatay yönlerde alanı ve kontrolleri kontrol edin.

İlk geliştirme sırasında Chrome üzerinde fare ve emüle edilmiş dokunmatik girişle bu temel akışlar doğrulandı. Fiziksel mobil cihazlarda ayrıca deneme yapılması önerilir.
