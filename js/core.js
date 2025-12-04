document.addEventListener('DOMContentLoaded', () => {

    const RateHelper = {
        constrain: function(val, min, max) {
            return Math.max(min, Math.min(val, max));
        },

        // betaflight-configurator SNIPPET 1: BETAFLIGHT RATES 
        getBetaflightRates: function (rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo, superExpoActive, limit) {
            let angularVel;

            if (rcRate > 2) {
                rcRate = rcRate + (rcRate - 2) * 14.54;
            }

            let expoPower;
            let rcRateConstant;

            expoPower = 3;
            rcRateConstant = 200;

            if (rcExpo > 0) {
                rcCommandf = rcCommandf * Math.pow(rcCommandfAbs, expoPower) * rcExpo + rcCommandf * (1 - rcExpo);
            }

            if (superExpoActive) {
                const rcFactor = 1 / this.constrain(1 - rcCommandfAbs * rate, 0.01, 1);
                angularVel = rcRateConstant * rcRate * rcCommandf; // 200 should be variable checked on version (older versions it's 205,9)
                angularVel = angularVel * rcFactor;
            } else {
                angularVel = ((rate * 100 + 27) * rcCommandf) / 16 / 4.1; // Only applies to old versions ?
            }

            angularVel = this.constrain(angularVel, -1 * limit, limit); // Rate limit from profile

            return angularVel;
        },

        // betaflight-configurator SNIPPET 2: ACTUAL RATES 
        getActualRates: function (rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo) {
            let angularVel;
            const expof = rcCommandfAbs * (Math.pow(rcCommandf, 5) * rcExpo + rcCommandf * (1 - rcExpo));

            angularVel = Math.max(0, rate - rcRate);
            angularVel = rcCommandf * rcRate + angularVel * expof;

            return angularVel;
        }
    };


    function convertBfToActual(bfRcRate, bfSuperRate, bfRcExpo) {
        const limit = 2000; // Standard Betaflight Limit

        const targetMaxRate = Math.round(RateHelper.getBetaflightRates(
            1.0, 1.0, bfSuperRate, bfRcRate, bfRcExpo, true, limit
        ));

        const checkPoints = [];
        for (let i = 0; i <= 100; i++) {
            checkPoints.push(i / 100);
        }
        
        const targets = checkPoints.map(stick => 
            RateHelper.getBetaflightRates(stick, stick, bfSuperRate, bfRcRate, bfRcExpo, true, limit)
        );

        const startCenter = Math.round(200 * bfRcRate * (1 - bfRcExpo));

        let bestCenter = startCenter;
        let bestExpo = 0;
        let minError = Infinity;

        // curvature weights 
        const N = checkPoints.length;

        function safeBF(x) {
            return RateHelper.getBetaflightRates(
                x, x,
                bfSuperRate,
                bfRcRate,
                bfRcExpo,
                true,
                limit
            );
        }

        const second = new Array(N);
        const h = 0.001;

        for (let i = 0; i < N; i++) {
            const x = checkPoints[i];

            const xl = Math.max(0, x - h);
            const xr = Math.min(1, x + h);

            const fm = safeBF(xl);
            const f0 = safeBF(x);
            const fp = safeBF(xr);

            second[i] = Math.abs(fp - 2 * f0 + fm) / (h * h);
        }

        const biased = second.map(v => v + 0.0001);
        const minV = Math.min(...biased);
        const maxV = Math.max(...biased);

        const weights = biased.map(v => {
            const t = (v - minV) / (maxV - minV);
            return 1 + t * 4;
        });

        for (let c = startCenter - 50; c <= startCenter + 50; c++) {
            for (let e = 0.00; e <= 1.00; e += 0.01) {
                
                let totalError = 0;

                for (let i = 0; i < checkPoints.length; i++) {
                    const stick = checkPoints[i];
                    const bfVal = targets[i];

                    const actVal = RateHelper.getActualRates(
                        stick, stick, targetMaxRate, c, e
                    );

                    totalError += weights[i] * Math.abs(bfVal - actVal);
                }

                if (totalError < minError) {
                    minError = totalError;
                    bestCenter = c;
                    bestExpo = e;
                }
            }
        }

        return {
            centerSensitivity: bestCenter,
            maxRate: targetMaxRate,
            actualExpo: bestExpo
        };

    }

    function convertActualToBf(actCenter, actMax, actExpo) {
        const limit = 2000;

        const checkPoints = [];
        for (let i = 0; i <= 100; i++) {
            checkPoints.push(i / 100);
        }

        const targets = checkPoints.map(stick => 
            RateHelper.getActualRates(stick, stick, actMax, actCenter, actExpo)
        );

        const startRcRate = actCenter / 200; 
        
        let bestRcRate = startRcRate;
        let bestSuperRate = 0.70;
        let bestRcExpo = 0;
        let minError = Infinity;

        const N = checkPoints.length;
        
        function safeAct(x) {
            return RateHelper.getActualRates(x, x, actMax, actCenter, actExpo);
        }

        const second = new Array(N);
        const h = 0.001;

        for (let i = 0; i < N; i++) {
            const x = checkPoints[i];
            const xl = Math.max(0, x - h);
            const xr = Math.min(1, x + h);
            const fm = safeAct(xl);
            const f0 = safeAct(x);
            const fp = safeAct(xr);
            second[i] = Math.abs(fp - 2 * f0 + fm) / (h * h);
        }

        const biased = second.map(v => v + 0.0001);
        const minV = Math.min(...biased);
        const maxV = Math.max(...biased);

        const weights = biased.map(v => {
            const t = (v - minV) / (maxV - minV);
            return 1 + t * 4;
        });
        
        
        for (let r = startRcRate - 0.50; r <= startRcRate + 0.50; r += 0.01) {
            if (r < 0.10) continue; 

            for (let e = 0.00; e <= 1.00; e += 0.01) {

                let s = 1.0 - ((200 * r) / actMax);
                if (s < 0.00 || s >= 1.0) continue;

                let totalError = 0;

                for (let i = 0; i < checkPoints.length; i++) {
                    const stick = checkPoints[i];
                    const actVal = targets[i];

                    const bfVal = RateHelper.getBetaflightRates(
                        stick, stick, s, r, e, true, limit
                    );

                    totalError += weights[i] * Math.abs(actVal - bfVal);
                }

                if (totalError < minError) {
                    minError = totalError;
                    bestRcRate = r;
                    bestSuperRate = s;
                    bestRcExpo = e;
                }
            }
        }

        return {
            rcRate: bestRcRate,
            superRate: bestSuperRate,
            rcExpo: bestRcExpo
        };
    }

    const ui = {
        bf: {
            rcRate: document.getElementById('in-rcRate'),
            rate: document.getElementById('in-rate'), 
            expo: document.getElementById('in-expo'),
            dispRc: document.getElementById('disp-rc'),
            dispRate: document.getElementById('disp-rate'),
            dispExpo: document.getElementById('disp-expo'),
            maxDisplay: document.getElementById('betaflight-max-display')
        },
        act: {
            center: document.getElementById('in-center'),
            max: document.getElementById('in-max'),
            expo: document.getElementById('in-actExpo'),
            dispCenter: document.getElementById('disp-center'),
            dispMax: document.getElementById('disp-max'),
            dispExpo: document.getElementById('disp-actExpo'),
            maxDisplay: document.getElementById('act-max-display')
        },
        canvas: document.getElementById('rateGraph'),
        btnMatch: document.getElementById('btn-automatch')
    };

    let lastEditedMode = 'betaflight'; 

    function getValues() {
        return {
            bf: {
                rcRate: parseFloat(ui.bf.rcRate.value),
                superRate: parseFloat(ui.bf.rate.value),
                expo: parseFloat(ui.bf.expo.value)
            },
            act: {
                center: parseInt(ui.act.center.value),
                max: parseInt(ui.act.max.value),
                expo: parseFloat(ui.act.expo.value)
            }
        };
    }

    function displayMaxRate() {
        let v = getValues();
        const bfMax = Math.round(RateHelper.getBetaflightRates(1, 1, v.bf.superRate, v.bf.rcRate, v.bf.expo, true, 2000));
        ui.bf.maxDisplay.textContent = `${bfMax} deg/s`;
        ui.act.maxDisplay.textContent = `${v.act.max} deg/s`;
    }

    function updateDisplayBf() {
        const v = getValues();
        let parEl = this.parentElement;
        let inputEl = parEl.getElementsByTagName('input');
        if (this.id == inputEl[0].id){
            inputEl[1].value = this.value;
        } else {
            inputEl[0].value = this.value;
        }
        displayMaxRate();
        drawGraph(v);
    }

    [ui.bf.dispRc, ui.bf.rcRate, ui.bf.rate, ui.bf.dispRate, ui.bf.expo, ui.bf.dispExpo, ui.act.center, ui.act.dispCenter, ui.act.max, ui.act.dispMax, ui.act.expo, ui.act.dispExpo].forEach(index => {
         index.addEventListener('input', updateDisplayBf);
    })

    function drawGraph(vals) {
        const ctx = ui.canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        const rect = ui.canvas.getBoundingClientRect();
        ui.canvas.width = rect.width * dpr;
        ui.canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width;
        const h = rect.height;

        ctx.clearRect(0, 0, w, h);
        
        const paddingLeft = 50;
        const paddingBottom = 40;
        const paddingTop = 20;
        const paddingRight = 20;
        const graphW = w - paddingLeft - paddingRight;
        const graphH = h - paddingTop - paddingBottom;
        const maxY = Math.max(vals.act.max, RateHelper.getBetaflightRates(1, 1, vals.bf.superRate, vals.bf.rcRate, vals.bf.expo, true, 2000)) * 1.01;

        const getX = (stick) => paddingLeft + (stick * graphW);
        const getY = (rate) => h - paddingBottom - ((rate / maxY) * graphH);

        // grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.font = '10px monospace';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.beginPath();
        ctx.moveTo(paddingLeft, paddingTop); ctx.lineTo(paddingLeft, h - paddingBottom); ctx.lineTo(w - paddingRight, h - paddingBottom);

        for(let i = 0; i <= 40; i++) {
            const val = i * 50; 
            const y = getY(val);
        
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(w - paddingRight, y);
        }

        for(let i = 0; i <= 10; i++) {
            const stick = i / 10;
            const x = getX(stick);

            ctx.moveTo(x, h - paddingBottom);
            ctx.lineTo(x, paddingTop);
        }
        ctx.stroke();

        for(let j = 0; j <= 20; j++) {
                const labelVal = j * 100;
                const y = getY(labelVal);
                ctx.fillText(labelVal, paddingLeft - 10, y);
        }

        for(let k = 0; k<=10; k++){
            const stickPos = k / 10;
            const x = getX(stickPos);
            ctx.fillText((stickPos * 100).toFixed(0) + '%', x + 12 , h - paddingBottom + 15);
        }

        function drawCurve(color, type) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;

            for (let i = 0; i <= 100; i++) {
                const stick = i / 100;
                let rateVal = 0;

                if (type === 'bf') {
                    rateVal = RateHelper.getBetaflightRates(stick, stick, vals.bf.superRate, vals.bf.rcRate, vals.bf.expo, true, 2000);
                } else {
                    rateVal = RateHelper.getActualRates(stick, stick, vals.act.max, vals.act.center, vals.act.expo);
                }

                const x = getX(stick);
                const y = getY(rateVal);

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighten';

        drawCurve('#52A9FF', 'act'); 
        drawCurve('#FF5252', 'bf'); 

        ctx.restore();

        ctx.textAlign = 'center';
        const centerX = paddingLeft + (w - paddingLeft - paddingRight - 20) / 2;
        ctx.fillText("Stick Position", centerX, h - 3.5);
        ctx.save();

        const centerY = paddingTop + (h - paddingTop - paddingBottom) / 2;
        ctx.translate(5, centerY); 
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("Rate (deg/s)", 0, 0);

        ctx.restore();
    }

    [ui.bf.rcRate, ui.bf.rate, ui.bf.expo].forEach(input => {
        input.addEventListener('input', () => {
            lastEditedMode = 'betaflight';
        });
    });

    [ui.act.center, ui.act.max, ui.act.expo].forEach(input => {
        input.addEventListener('input', () => {
            lastEditedMode = 'actual';
        });
    });

    ui.btnMatch.addEventListener('click', () => {
        let v = getValues();
        
        if (lastEditedMode === 'betaflight') {
            const res = convertBfToActual(v.bf.rcRate, v.bf.superRate, v.bf.expo);
            ui.act.center.value = res.centerSensitivity;
            ui.act.dispCenter.value = res.centerSensitivity;
            ui.act.max.value = res.maxRate;
            ui.act.dispMax.value = res.maxRate;
            ui.act.expo.value = res.actualExpo;
            ui.act.dispExpo.value = res.actualExpo.toFixed(2);
        } else {
            const res = convertActualToBf(v.act.center, v.act.max, v.act.expo);
            ui.bf.rcRate.value = res.rcRate;
            ui.bf.dispRc.value = res.rcRate;
            ui.bf.rate.value = res.superRate;
            ui.bf.dispRate.value = res.superRate;
            ui.bf.expo.value = res.rcExpo;
            ui.bf.dispExpo.value = res.rcExpo;
        }
        v = getValues();
        displayMaxRate();
        drawGraph(v);
    });
    const v = getValues();
    displayMaxRate();
    drawGraph(v);
});