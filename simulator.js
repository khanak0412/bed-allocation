class SeededRNG {
  constructor(seed = 20260911) {
    this.initialSeed = seed;
    this.s = Math.abs(seed) || 1;
    this.haveNextNextGaussian = false;
    this.nextNextGaussian = 0.0;
  }

  reset(newSeed = null) {
    if (newSeed !== null) this.initialSeed = newSeed;
    this.s = Math.abs(this.initialSeed) || 1;
    this.haveNextNextGaussian = false;
  }

  random() {
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  gaussian() {
    if (this.haveNextNextGaussian) {
      this.haveNextNextGaussian = false;
      return this.nextNextGaussian;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = this.random() * 2 - 1;
      v = this.random() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);

    const mul = Math.sqrt(-2.0 * Math.log(s) / s);
    this.nextNextGaussian = v * mul;
    this.haveNextNextGaussian = true;
    return u * mul;
  }

  exponential(mean) {
    const u = Math.max(1e-12, this.random());
    return -mean * Math.log(u);
  }

  lognormal(median, sigma = 0.35) {
    const mu = Math.log(median);
    const z = this.gaussian();
    return Math.exp(mu + sigma * z);
  }
}

const BENCHMARK = {
  TOTAL_PATIENTS: 500,
  MEAN_INTERARRIVAL: 2.5,
  ACUITY_PROBS: [0.60, 0.30, 0.10],
  BED_CAPACITIES: { general: 30, monitored: 10, critical: 5 },
  TOTAL_BEDS: 45,
  STAY_SIGMA: 0.35,
  STAY_MEDIANS: { general: 120, monitored: 180, critical: 240 },
  ACUITY_WEIGHTS: { 1: 1, 2: 3, 3: 8 },
  MAX_WAIT_CAP: 240,
  POINTS: { WAIT: 45, CRITICAL: 20, REJECT: 15, SPECIALIZED: 15, RUNTIME: 5 }
};

class OnlineBedAllocationPolicy {
  constructor() {
    this.reset();
  }

  reset() {
    this.critReservationForL3 = 1;
    this.monReservationForL2 = 2;
  }

  decideBedAllocation(patient, currentBeds, currentQueue, currentTime) {
    const acuity = patient.acuity;
    const wait = currentTime - patient.arrivalTime;

    if (acuity === 3) {
      if (currentBeds.critical > 0) return 'critical';
      return null;
    }

    if (acuity === 2) {
      if (currentBeds.monitored > 0) return 'monitored';
      const hasWaitingAcuity3 = currentQueue.some(p => p.acuity === 3);
      if (!hasWaitingAcuity3 && currentBeds.critical > this.critReservationForL3) {
        return 'critical';
      } else if (!hasWaitingAcuity3 && currentBeds.critical > 0 && wait > 50) {
        return 'critical';
      }
      return null;
    }

    if (acuity === 1) {
      if (currentBeds.general > 0) return 'general';
      const hasWaitingAcuity2Or3 = currentQueue.some(p => p.acuity >= 2);
      if (!hasWaitingAcuity2Or3 && currentBeds.monitored > this.monReservationForL2 && wait > 60) {
        return 'monitored';
      }
      if (!hasWaitingAcuity2Or3 && currentBeds.monitored === 0 && currentBeds.critical > 2 && wait > 180) {
        return 'critical';
      }
      return null;
    }

    return null;
  }

  computePriorityScore(patient, currentTime) {
    const wait = Math.min(currentTime - patient.arrivalTime, BENCHMARK.MAX_WAIT_CAP);
    const weight = BENCHMARK.ACUITY_WEIGHTS[patient.acuity];
    const urgencyFactor = wait > 200 ? 3.0 : (wait > 120 ? 1.5 : 1.0);
    return weight * wait * urgencyFactor;
  }
}

class DiscreteEventSimulator {
  constructor(seed = 20260911) {
    this.seed = seed;
    this.rng = new SeededRNG(seed);
    this.policy = new OnlineBedAllocationPolicy();
    this.reset();
  }

  reset(newSeed = null) {
    if (newSeed !== null) this.seed = newSeed;
    this.rng.reset(this.seed);
    this.policy.reset();

    this.simTime = 0.0;
    this.eventCount = 0;
    this.eventsQueue = [];

    this.beds = {
      general: new Array(BENCHMARK.BED_CAPACITIES.general).fill(null),
      monitored: new Array(BENCHMARK.BED_CAPACITIES.monitored).fill(null),
      critical: new Array(BENCHMARK.BED_CAPACITIES.critical).fill(null)
    };

    this.waitingQueue = [];
    this.completedStays = [];
    this.rejectedPatients = [];
    this.admittedPatients = [];
    this.allArrivals = [];

    this.avoidableSpecializedCount = 0;
    this.isRunning = false;
    this.timer = null;
    this.speedMultiplier = 25;

    this._generateArrivalStream();

    if (this.arrivalStream.length > 0) {
      const firstArrival = this.arrivalStream[0];
      this.scheduleEvent({
        type: 'PATIENT_ARRIVAL',
        time: firstArrival.arrivalTime,
        patient: firstArrival
      });
    }
  }

  _generateArrivalStream() {
    this.arrivalStream = [];
    let curTime = 0.0;

    for (let i = 1; i <= BENCHMARK.TOTAL_PATIENTS; i++) {
      const interArrival = this.rng.exponential(BENCHMARK.MEAN_INTERARRIVAL);
      curTime += interArrival;

      const r = this.rng.random();
      let acuity = 1;
      if (r < BENCHMARK.ACUITY_PROBS[0]) acuity = 1;
      else if (r < BENCHMARK.ACUITY_PROBS[0] + BENCHMARK.ACUITY_PROBS[1]) acuity = 2;
      else acuity = 3;

      const stayGen = this.rng.lognormal(BENCHMARK.STAY_MEDIANS.general, BENCHMARK.STAY_SIGMA);
      const stayMon = this.rng.lognormal(BENCHMARK.STAY_MEDIANS.monitored, BENCHMARK.STAY_SIGMA);
      const stayCrit = this.rng.lognormal(BENCHMARK.STAY_MEDIANS.critical, BENCHMARK.STAY_SIGMA);

      this.arrivalStream.push({
        id: i,
        arrivalTime: curTime,
        acuity: acuity,
        weight: BENCHMARK.ACUITY_WEIGHTS[acuity],
        status: 'SCHEDULED',
        wait: 0,
        assignedBedType: null,
        bedIndex: -1,
        admissionTime: null,
        departureTime: null,
        _hiddenStays: { general: stayGen, monitored: stayMon, critical: stayCrit }
      });
    }
  }

  scheduleEvent(event) {
    this.eventsQueue.push(event);
    this.eventsQueue.sort((a, b) => a.time - b.time);
  }

  getFreeBedCounts() {
    return {
      general: this.beds.general.filter(b => b === null).length,
      monitored: this.beds.monitored.filter(b => b === null).length,
      critical: this.beds.critical.filter(b => b === null).length
    };
  }

  step() {
    this.checkQueueTimeouts();

    if (this.eventsQueue.length === 0) {
      this.isRunning = false;
      updateSimulationUI();
      return false;
    }

    const currentEvent = this.eventsQueue.shift();
    this.simTime = currentEvent.time;
    this.eventCount++;

    if (currentEvent.type === 'PATIENT_ARRIVAL') {
      this.handlePatientArrival(currentEvent.patient);
    } else if (currentEvent.type === 'PATIENT_DEPARTURE') {
      this.handlePatientDeparture(currentEvent);
    }

    this.attemptAllocateQueue();

    const nextPatientIdx = this.allArrivals.length;
    if (currentEvent.type === 'PATIENT_ARRIVAL' && nextPatientIdx < this.arrivalStream.length) {
      const nextPatient = this.arrivalStream[nextPatientIdx];
      this.scheduleEvent({
        type: 'PATIENT_ARRIVAL',
        time: nextPatient.arrivalTime,
        patient: nextPatient
      });
    }

    return true;
  }

  handlePatientArrival(patient) {
    patient.status = 'ARRIVED';
    this.allArrivals.push(patient);
    this.waitingQueue.push(patient);
    logEvent(`Arrival: Patient #${patient.id} (Acuity L${patient.acuity}) arrived at ${formatTime(this.simTime)}`, 'arrival');
    this.attemptAllocateQueue();
  }

  handlePatientDeparture(event) {
    const { bedType, bedIndex, patient } = event;
    if (this.beds[bedType][bedIndex] === patient) {
      this.beds[bedType][bedIndex] = null;
    }

    patient.status = 'COMPLETED';
    patient.departureTime = this.simTime;
    this.completedStays.push(patient);

    logEvent(`Departure: Patient #${patient.id} discharged from ${bedType.toUpperCase()} #${bedIndex + 1} at ${formatTime(this.simTime)}`, 'departure');
    this.attemptAllocateQueue();
  }

  checkQueueTimeouts() {
    const remainingQueue = [];
    for (const p of this.waitingQueue) {
      const waitSoFar = this.simTime - p.arrivalTime;
      if (waitSoFar >= BENCHMARK.MAX_WAIT_CAP && p.status !== 'REJECTED') {
        p.status = 'REJECTED';
        p.wait = BENCHMARK.MAX_WAIT_CAP;
        this.rejectedPatients.push(p);

        const divertHospital = NEAREST_HOSPITALS[p.id % NEAREST_HOSPITALS.length];
        p.divertedTo = divertHospital;

        logEvent(`TIMEOUT / REJECTION: Patient #${p.id} (L${p.acuity}) exceeded 240m wait. Diverted to ${divertHospital.name}`, 'reject');
        addDivertedPatientToUI(p);
      } else {
        remainingQueue.push(p);
      }
    }
    this.waitingQueue = remainingQueue;
  }

  attemptAllocateQueue() {
    if (this.waitingQueue.length === 0) return;

    this.waitingQueue.sort((a, b) => {
      const scoreB = this.policy.computePriorityScore(b, this.simTime);
      const scoreA = this.policy.computePriorityScore(a, this.simTime);
      return scoreB - scoreA;
    });

    const unassignedQueue = [];

    for (const patient of this.waitingQueue) {
      const freeBeds = this.getFreeBedCounts();
      const decisionBedType = this.policy.decideBedAllocation(patient, freeBeds, this.waitingQueue, this.simTime);

      if (decisionBedType && freeBeds[decisionBedType] > 0) {
        const bedIdx = this.beds[decisionBedType].indexOf(null);
        if (bedIdx !== -1) {
          if (patient.acuity === 1 && (decisionBedType === 'monitored' || decisionBedType === 'critical') && freeBeds.general > 0) {
            this.avoidableSpecializedCount++;
          } else if (patient.acuity === 2 && decisionBedType === 'critical' && freeBeds.monitored > 0) {
            this.avoidableSpecializedCount++;
          }

          this.beds[decisionBedType][bedIdx] = patient;
          patient.status = 'ADMITTED';
          patient.assignedBedType = decisionBedType;
          patient.bedIndex = bedIdx;
          patient.admissionTime = this.simTime;
          patient.wait = this.simTime - patient.arrivalTime;

          this.admittedPatients.push(patient);

          const realizedStay = patient._hiddenStays[decisionBedType];
          patient.realizedStay = realizedStay;

          this.scheduleEvent({
            type: 'PATIENT_DEPARTURE',
            time: this.simTime + realizedStay,
            bedType: decisionBedType,
            bedIndex: bedIdx,
            patient: patient
          });

          logEvent(`Admit: Patient #${patient.id} (L${patient.acuity}) -> ${decisionBedType.toUpperCase()} #${bedIdx + 1} (Waited: ${patient.wait.toFixed(1)}m)`, 'admit');
        } else {
          unassignedQueue.push(patient);
        }
      } else {
        unassignedQueue.push(patient);
      }
    }

    this.waitingQueue = unassignedQueue;
  }

  calculateMetrics() {
    const totalArrivals = this.allArrivals.length;
    if (totalArrivals === 0) {
      return {
        uWait: 0, ptsWait: 0, uCritical: 1, ptsCritical: BENCHMARK.POINTS.CRITICAL,
        uReject: 1, ptsReject: BENCHMARK.POINTS.REJECT, uSpecialized: 1, ptsSpecialized: BENCHMARK.POINTS.SPECIALIZED,
        ptsRuntime: BENCHMARK.POINTS.RUNTIME, totalScore: 0
      };
    }

    let sumWeightedWait = 0.0;
    let sumWeights = 0.0;
    let sumCriticalWait = 0.0;
    let nCritical = 0;

    for (const p of this.allArrivals) {
      const w = p.weight;
      let realizedWait = 0;
      if (p.admissionTime !== null) realizedWait = p.wait;
      else if (p.status === 'REJECTED') realizedWait = BENCHMARK.MAX_WAIT_CAP;
      else realizedWait = Math.min(this.simTime - p.arrivalTime, BENCHMARK.MAX_WAIT_CAP);

      const cappedWait = Math.min(realizedWait, BENCHMARK.MAX_WAIT_CAP);
      sumWeightedWait += w * cappedWait;
      sumWeights += w;

      if (p.acuity === 3) {
        sumCriticalWait += cappedWait;
        nCritical++;
      }
    }

    const uWaitRaw = sumWeights > 0 ? 1.0 - (sumWeightedWait / (BENCHMARK.MAX_WAIT_CAP * sumWeights)) : 1.0;
    const uWait = Math.max(0, Math.min(1, uWaitRaw));
    const ptsWait = uWait * BENCHMARK.POINTS.WAIT;

    let uCritical = 1.0;
    if (nCritical > 0) {
      const uCritRaw = 1.0 - (sumCriticalWait / (BENCHMARK.MAX_WAIT_CAP * nCritical));
      uCritical = Math.max(0, Math.min(1, uCritRaw));
    }
    const ptsCritical = uCritical * BENCHMARK.POINTS.CRITICAL;

    const nRejected = this.rejectedPatients.length;
    const uRejectRaw = 1.0 - (nRejected / BENCHMARK.TOTAL_PATIENTS);
    const uReject = Math.max(0, Math.min(1, uRejectRaw));
    const ptsReject = uReject * BENCHMARK.POINTS.REJECT;

    const nAdmitted = this.admittedPatients.length;
    let uSpecialized = 1.0;
    if (nAdmitted > 0) {
      const uSpecRaw = 1.0 - (this.avoidableSpecializedCount / nAdmitted);
      uSpecialized = Math.max(0, Math.min(1, uSpecRaw));
    }
    const ptsSpecialized = uSpecialized * BENCHMARK.POINTS.SPECIALIZED;
    const ptsRuntime = BENCHMARK.POINTS.RUNTIME;

    const totalScore = ptsWait + ptsCritical + ptsReject + ptsSpecialized + ptsRuntime;

    return {
      uWait, ptsWait, uCritical, ptsCritical, uReject, ptsReject,
      uSpecialized, ptsSpecialized, ptsRuntime, totalScore,
      nRejected, nAdmitted, avoidableCount: this.avoidableSpecializedCount
    };
  }
}
