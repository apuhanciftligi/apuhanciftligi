# Tarif görsellerinin üretim kaydı

## 2026-11-18: İkinci seri

Beş yeni görsel yerleşik `image_gen` aracıyla, her tarif için ayrı bir çağrıda
üretildi. CLI/API fallback kullanılmadı. Fotoğraf gerçekçiliğinde yapay zekâ
görselleridir; gerçek mutfak veya çiftlik çekimi değildir. Üretilen PNG'ler,
Next.js ile zaten kurulu `sharp` kullanılarak kompozisyon değiştirilmeden
1200×900 WebP dosyalarına dönüştürüldü (kalite: 84).

### ispanakli-firin-omleti

Dosya: `public/tarifler/ispanakli-firin-omleti.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: ispanakli firin omleti, a home-baked spinach, egg and white cheese omelet in a square ceramic baking dish.
Subject: a modest 20 by 20 cm cream ceramic baking dish filled with a shallow golden baked omelet, cooked chopped dark green spinach and small white brined cheese pieces distributed throughout. The top is lightly browned, egg fully set, no raw liquid. One of four square servings is slightly lifted onto a small plate beside the dish, revealing spinach in a soft fully cooked egg interior. No pastry crust, no tomatoes, no mushrooms, no whole sunny-side eggs, no garnish.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, dish central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, excessive props, or webpage. Save the image file for use in the project.
```

### gun-kurusu-kayisili-mercimek-salatasi

Dosya: `public/tarifler/gun-kurusu-kayisili-mercimek-salatasi.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: gun kurusu kayisili mercimek salatasi, a Turkish green lentil salad with sun-dried apricots, walnuts, spring onions and parsley.
Subject: one modest shallow cream ceramic salad bowl with cooked green-brown lentils that retain their individual shapes, small dark amber-brown sun-dried apricot cubes, rough walnut chunks, finely chopped fresh parsley and thinly sliced spring onion. Light olive oil and lemon dressing, no pooled sauce. Naturally mixed with lentils dominant and apricot a modest accent. No fresh orange apricot halves, tomatoes, red pepper, pomegranate, cheese, meat, rice or bulgur.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, bowl central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, excessive props, or webpage. Save the image file for use in the project.
```

### sari-kuru-kayisili-irmik-tatlisi

Dosya: `public/tarifler/sari-kuru-kayisili-irmik-tatlisi.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: sari kuru kayisili irmik tatlisi, chilled Turkish milk and semolina pudding with dried yellow apricot sauce.
Subject: three modest small clear glass dessert bowls of ivory milk semolina pudding with a thick yellow-orange apricot topping made of chopped softened dried apricot pieces and a little mashed apricot sauce. The pudding is fully set yet spoonable, with fine semolina texture, not layered cake or gelatin. The apricot topping remains a distinct layer over the creamy pudding. All three bowls are fully inside the frame. No fresh fruit halves, nuts, pistachios, mint, cinnamon garnish, caramel, cookies or custard-yellow pudding.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, bowls central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, excessive props, or webpage. Save the image file for use in the project.
```

### dut-kurulu-cevizli-eriste

Dosya: `public/tarifler/dut-kurulu-cevizli-eriste.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: dut kurulu cevizli eriste, short Turkish flat egg noodles with butter, dried white mulberries and walnuts.
Subject: one modest shallow cream ceramic plate of cooked short flat rustic eriste strips, lightly glossy with melted butter, mixed with rough walnut chunks and a modest scattering of softened pale tan dried white mulberries showing their distinctive small knobbly segmented shape. A little fine black pepper. Noodles dominate; dried mulberries are a small accent, not giant berries. No parsley, other herbs, cheese, cream sauce, meat, raisins, apricots, red fruits, spaghetti or farfalle pasta.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, plate central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, excessive props, or webpage. Save the image file for use in the project.
```

### dut-pekmezli-un-helvasi

Dosya: `public/tarifler/dut-pekmezli-un-helvasi.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: dut pekmezli un helvasi, Turkish flour halva made with butter, mulberry molasses and walnuts.
Subject: one small cream ceramic dessert plate with three modest spoon-shaped oval scoops of warm brown flour halva. Dense fine-grained toasted flour texture, soft but holding spoon ridges, small walnut fragments mixed through and a couple visible at the surface. Color warm medium brown from toasted flour and dark mulberry molasses. This is homemade flour halva, not tahini halva, cake, ice cream, semolina pudding or chocolate. No syrup poured over, no ice cream, no mint, no pistachio, no powdered sugar and no garnish outside the recipe.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, plate central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, excessive props, or webpage. Save the image file for use in the project.
```


## 2026-11-18: İlk seri

Yerleşik `image_gen` aracıyla her tarif için ayrı bir çağrıda üretildi. CLI/API
fallback kullanılmadı. Bunlar fotoğraf gerçekçiliğinde yapay zekâ görselleridir;
gerçek çiftlik veya mutfak çekimi değildir. Üretilen PNG dosyaları, projede
Next.js ile zaten kurulu olan `sharp` kullanılarak kompozisyon değiştirilmeden
1200×900 WebP biçimine dönüştürüldü (kalite: 84).

### sarimsakli-yogurtlu-cilbir

Dosya: `public/tarifler/sarimsakli-yogurtlu-cilbir.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: a plate of sarimsakli yogurtlu cilbir, Turkish poached eggs on garlic yogurt with paprika butter.
Subject: one shallow cream ceramic plate of thick white yogurt topped with exactly two compact poached eggs, fully cooked opaque whites and set yolks, drizzled with reddish melted paprika butter. Modest home serving, no additional garnish.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, dish central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, herbs, vegetables, runny egg yolks, or excessive props. Do not show a webpage. Save the image file for use in the project.
```

### gun-kurusu-kayisili-bulgur-pilavi

Dosya: `public/tarifler/gun-kurusu-kayisili-bulgur-pilavi.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: gun kurusu kayisili bulgur pilavi, Turkish bulgur pilaf with sun-dried apricots and walnuts.
Subject: one shallow cream ceramic serving bowl with separate fluffy golden-brown bulgur grains, naturally dark amber-brown chopped sun-dried apricot pieces, small translucent cooked onion pieces and rough walnut chunks distributed through the pilaf. No tomato, green garnish, raisins, meat, or bright orange fresh apricots.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, dish central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, or excessive props. Do not show a webpage. Save the image file for use in the project.
```

### sari-kuru-kayisi-hosafi

Dosya: `public/tarifler/sari-kuru-kayisi-hosafi.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: sari kuru kayisi hosafi, a simple traditional Turkish chilled dried apricot compote.
Subject: a single modest clear glass dessert bowl filled with translucent pale golden liquid and several softened yellow-orange dried apricot halves, with natural wrinkled apricot texture. The apricot pieces are partly submerged in a light clear broth, not jam or thick syrup. A plain small spoon beside the bowl.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, bowl central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no fresh apricots, pits, raisins, red fruits, herbs, citrus slices, floating cinnamon sticks, people, hands, text, logos, packaging, watermark, collage, or excessive props. Do not show a webpage. Save the image file for use in the project.
```

### dut-pekmezli-tahinli-yogurt

Dosya: `public/tarifler/dut-pekmezli-tahinli-yogurt.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: dut pekmezli tahinli yogurt, two small bowls of strained plain yogurt with tahini, mulberry molasses, and walnuts.
Subject: two small handmade cream ceramic bowls, each filled with thick white yogurt, topped with a modest beige tahini ribbon and distinct dark brown glossy mulberry molasses swirls, with a few rough walnut chunks. Yogurt remains mostly white with clearly separate pale tahini and dark molasses ribbons. One bowl in the foreground, second just behind, both fully in frame.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, bowls central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no honey, sesame seeds, granola, oats, fruit, mint, people, hands, text, logos, packaging, watermark, collage, or excessive props. Do not show a webpage. Save the image file for use in the project.
```

### dut-kurulu-yulaf-kurabiyesi

Dosya: `public/tarifler/dut-kurulu-yulaf-kurabiyesi.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe page.
Primary request: dut kurulu yulaf kurabiyesi, homemade oatmeal cookies with dried white mulberry pieces and mulberry molasses.
Subject: a modest cream ceramic plate holding about six small rustic flattened oatmeal cookies, about 1 cm thick, warm brown from mulberry molasses, lightly browned edges, visible oat flakes and small pale tan dried mulberry segments with recognizably knobbly mulberry texture. One cookie broken to show a baked crumb without raw dough. No chocolate chips, raisins, nuts, icing, or powdered sugar.
Style/medium: believable editorial food photography, naturally imperfect edible textures, soft window daylight, matte pale stone tabletop and oatmeal linen. Landscape 4:3 framing, three-quarter view, plate central with safe margins for responsive crops, gently soft background.
Constraints: one full-bleed food photo, no people, hands, text, logos, packaging, watermark, collage, or excessive props. Do not show a webpage. Save the image file for use in the project.
```

## 2026-10-15: İlk üç tarif

2026-10-15 tarihinde yerleşik image_gen aracıyla, her tarif için ayrı bir çağrıda üretildi. CLI/API fallback kullanılmadı. Üçü de fotoğraf gerçekçiliğinde yapay zekâ görselidir; gerçek çiftlik çekimi değildir.

Teslim edilen görseller WebP biçiminde `public/tarifler/` altındadır. Dönüşüm yalnızca web için boyut ve dosya sıkıştırması uygular; kompozisyonu değiştirmez.

### koy-yumurtali-menemen

Dosya: `public/tarifler/koy-yumurtali-menemen.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe detail page.
Style/medium: believable editorial food photography, natural edible textures, modest home cooking, warm soft window daylight from the left, matte pale stone tabletop with a subtle oatmeal linen napkin, gentle shadows, restrained earthy colors. Landscape 4:3 framing. One finished dish dominates the central 75 percent, with safe margins for responsive crops. Three-quarter view from about 45 degrees, food in clear focus, gently soft background. No people, no hands, no text, no lettering, no logos, no watermark, no collage, no packaging, no excessive props. A full-bleed photo only, not a webpage or poster.
Primary request: a freshly cooked Turkish köy yumurtalı menemen, two-person serving, in a small well-used dark iron frying pan.
Subject: three eggs gently scrambled and fully cooked through into a juicy mixture of finely grated ripe red tomatoes and sliced green peppers cooked in olive oil. The mixture has soft small yellow egg curds amid red tomato and green pepper pieces, moist but not watery. Lightly rustic and naturally imperfect. A small piece of crusty bread can sit at the edge of the composition.
Constraints: authentic scrambled menemen, no intact sunny-side eggs, no runny yolks, no cheese, no meat, no onion, no parsley garnish. Appetizing, realistic food, no oversized ingredients or artificial shine.
```

### firinda-yumurtali-patates

Dosya: `public/tarifler/firinda-yumurtali-patates.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe detail page.
Style/medium: believable editorial food photography, natural edible textures, modest home cooking, warm soft window daylight from the left, matte pale stone tabletop with a subtle oatmeal linen napkin, gentle shadows, restrained earthy colors. Landscape 4:3 framing. One finished dish dominates the central 75 percent, with safe margins for responsive crops. Three-quarter view from about 45 degrees, food in clear focus, gently soft background. No people, no hands, no text, no lettering, no logos, no watermark, no collage, no packaging, no excessive props. A full-bleed photo only, not a webpage or poster.
Primary request: Turkish fırında yumurtalı patates, four-person serving in a shallow off-white ceramic baking dish.
Subject: golden roasted potato cubes about 2 cm across, gently browned edges, paprika and dried thyme, with exactly four whole baked eggs nestled in separate wells between potatoes. Egg whites fully set and opaque and yolks set, not runny. A small scattering of finely chopped fresh parsley as in the recipe.
Constraints: potatoes and eggs dominate, believable proportions. Exactly four eggs, no extra eggs, no cheese, no meat, no tomatoes, no peppers. Show the entire baking dish within the frame with a modest rim and natural home-cooked texture.
```

### ev-yapimi-yogurt

Dosya: `public/tarifler/ev-yapimi-yogurt.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe detail page.
Style/medium: believable editorial food photography, natural edible textures, modest home cooking, warm soft window daylight from the left, matte pale stone tabletop with a subtle oatmeal linen napkin, gentle shadows, restrained earthy colors. Landscape 4:3 framing. One finished dish dominates the central 75 percent, with safe margins for responsive crops. Three-quarter view from about 45 degrees, food in clear focus, gently soft background. No people, no hands, no text, no lettering, no logos, no watermark, no collage, no packaging, no excessive props. A full-bleed photo only, not a webpage or poster.
Primary request: plain homemade Turkish yogurt made with fresh milk.
Subject: one simple handmade off-white ceramic bowl filled with thick plain ivory yogurt. A spoon gently resting in the bowl reveals the naturally set creamy texture with a soft scoop ridge, not whipped cream or ice cream. A small unbranded glass milk carafe in the soft background indicates fresh milk.
Constraints: plain unsweetened yogurt, no fruit, no berries, no honey, no granola, no mint, no other garnish. Natural subtle texture and slight sheen, not overly perfect swirls. Bowl is the clear focal point, the milk carafe stays secondary.
```

