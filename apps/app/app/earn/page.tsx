"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import {
  QUIZ_MODULES,
  getQuizById,
  getQuizCatalog,
  getCompletedQuizzes,
  completeQuiz,
  getTotalQuizPoints,
  type Quiz,
  type QuizModule,
  type QuizQuestion,
} from "@/lib/quiz-service"
import { toast } from "sonner"
import Link from "next/link"
import { BookOpen, Coffee, Sparkles, Trophy, Award, Target, ArrowLeft, Check } from "@/lib/icons"

/** Cadence badge labels and colors */
const cadenceLabels = {
  once: { es: "Una vez", en: "One time" },
  monthly: { es: "Mensual", en: "Monthly" },
  weekly: { es: "Semanal", en: "Weekly" },
}
const cadenceColors = {
  once: "bg-purple-100 text-purple-700",
  monthly: "bg-blue-100 text-blue-700",
  weekly: "bg-amber-100 text-amber-700",
}

// Quiz answer feedback colors
const QUIZ_ANSWER_COLORS = {
  correct: "border-green-400 bg-green-50 text-green-800",
  incorrect: "border-red-400 bg-red-50 text-red-800",
  disabled: "border-brand-100 bg-brand-50 text-brand-300",
  default: "border-brand-200 bg-white text-brand-700 hover:border-brand-300",
}

export default function EarnPage() {
  const { user, loading: authLoading } = useAuth()
  const { t, locale } = useLanguage()
  const isEn = locale === "en"

  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [quizFinished, setQuizFinished] = useState(false)
  const [awarding, setAwarding] = useState(false)
  const [modules, setModules] = useState<QuizModule[]>(QUIZ_MODULES)
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([])

  useEffect(() => {
    // Esperar a que Firebase Auth termine de inicializar antes de hacer fetch
    if (authLoading) return
    if (!user?.uid) { setLoading(false); return }
    Promise.all([
      getCompletedQuizzes(user.uid),
      getQuizCatalog(),
    ]).then(([ids, catalog]) => {
      setCompletedIds(ids)
      setModules(catalog.modules)
      setAllQuizzes(catalog.allQuizzes)
      setLoading(false)
    }).catch((err) => {
      console.error("Error loading quizzes:", err)
      setLoading(false)
    })
  }, [user?.uid, authLoading])

  const startQuiz = (quizId: string) => {
    const quiz = allQuizzes.find(q => q.id === quizId) || getQuizById(quizId)
    if (!quiz) return
    setActiveQuiz(quiz)
    setCurrentQ(0)
    setSelectedAnswer(null)
    setShowExplanation(false)
    setCorrectCount(0)
    setQuizFinished(false)
  }

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return
    setSelectedAnswer(index)
    setShowExplanation(true)
    const question = activeQuiz!.questions[currentQ]
    if (question.correctIndex < (question.options?.length ?? 0) && index === question.correctIndex) {
      setCorrectCount(prev => prev + 1)
    }
  }

  const nextQuestion = async () => {
    if (currentQ < activeQuiz!.questions.length - 1) {
      setCurrentQ(prev => prev + 1)
      setSelectedAnswer(null)
      setShowExplanation(false)
    } else {
      setQuizFinished(true)
      if (user?.uid && !completedIds.includes(activeQuiz!.id)) {
        setAwarding(true)
        const timeoutIds: NodeJS.Timeout[] = []
        try {
          // completeQuiz already handles idempotency via alreadyCompleted check
          const result = await completeQuiz(user.uid, activeQuiz!.id, activeQuiz!.points)
          if (result.success && !result.alreadyCompleted) {
            setCompletedIds(prev => [...prev, activeQuiz!.id])
            toast.success(
              isEn
                ? `+${activeQuiz!.points} beans earned!`
                : `+${activeQuiz!.points} granos ganados!`
            )
            // Celebrar badges nuevos
            if (result.newBadges && result.newBadges.length > 0) {
              const { BADGES } = await import("@/lib/gamification/constants")
              for (const badgeId of result.newBadges) {
                const badge = BADGES.find(b => b.id === badgeId)
                if (badge) {
                  const timeoutId = setTimeout(() => {
                    toast.success(
                      `${badge.emoji} ${isEn ? badge.celebrationEn : badge.celebration}`,
                      { duration: 5000 }
                    )
                  }, 1500)
                  timeoutIds.push(timeoutId)
                }
              }
            }
          }
        } catch (error) {
          console.error("Error completing quiz:", error)
          toast.error(isEn ? "Network error. Please try again." : "Error de red. Intenta de nuevo.")
          setQuizFinished(false)
        } finally {
          setAwarding(false)
          // Cleanup: clear any pending timeouts
          timeoutIds.forEach(id => clearTimeout(id))
        }
      }
    }
  }

  const closeQuiz = () => {
    setActiveQuiz(null)
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100">
          <BookOpen className="h-10 w-10 text-brand-500" />
        </div>
        <p className="text-brand-500">{t("profile.notsignedin")}</p>
        <Link href="/login" className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm text-white">
          {t("profile.signin")}
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
      </div>
    )
  }

  // ── Active quiz view ──
  if (activeQuiz) {
    const q: QuizQuestion = activeQuiz.questions[currentQ]
    const isCorrect = selectedAnswer === q.correctIndex
    const totalQ = activeQuiz.questions.length
    const alreadyCompleted = completedIds.includes(activeQuiz.id)

    if (quizFinished) {
      const allCorrect = correctCount === totalQ
      const insight = isEn
        ? "Try applying what you learned on your next visit!"
        : "Prueba a aplicar lo aprendido en tu próxima visita!"

      return (
        <div className="space-y-5 animate-fade-up pb-8">
          <div className="rounded-2xl border border-brand-200/70 bg-white p-6 text-center">
            <div className="flex justify-center mb-3">
              {allCorrect ? (
                <Trophy className="h-12 w-12 text-amber-500" />
              ) : correctCount >= totalQ / 2 ? (
                <Award className="h-12 w-12 text-blue-500" />
              ) : (
                <Target className="h-12 w-12 text-purple-500" />
              )}
            </div>
            <h2 className="text-lg font-bold text-brand-900">
              {allCorrect
                ? (isEn ? "Perfect!" : "¡Perfecto!")
                : (isEn ? "Quiz complete!" : "¡Quiz completado!")}
            </h2>
            <p className="text-sm text-brand-500 mt-1">
              {correctCount}/{totalQ} {isEn ? "correct" : "correctas"}
            </p>

            {!alreadyCompleted && (
              <div className="mt-4 rounded-xl bg-leaf-50 border border-leaf-200 px-4 py-3">
                <p className="text-sm font-bold text-leaf-700">
                  {awarding ? "..." : (
                    <>
                      +{activeQuiz.points} {isEn ? "beans" : "granos"} <Sparkles className="h-4 w-4 inline ml-1" />
                    </>
                  )}
                </p>
              </div>
            )}
            {alreadyCompleted && (
              <p className="mt-3 text-xs text-brand-400">
                {isEn ? "Beans already earned for this quiz" : "Ya has ganado los granos de este quiz"}
              </p>
            )}

            {/* Insight from PDF: 1 actionable tip */}
            <p className="mt-4 text-xs text-brand-500 italic">{insight}</p>

            <div className="flex gap-2 mt-5">
              <button
                onClick={closeQuiz}
                className="flex-1 rounded-xl bg-brand-900 py-3 text-sm font-bold text-white hover:bg-brand-800 transition-colors"
              >
                {isEn ? "Back to quizzes" : "Volver a los quizzes"}
              </button>
              <Link
                href="/rewards"
                className="flex-1 rounded-xl border-2 border-leaf-600 py-3 text-sm font-bold text-leaf-700 hover:bg-leaf-50 transition-colors text-center"
              >
                {isEn ? "See rewards" : "Ver recompensas"}
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4 animate-fade-up pb-8">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <button onClick={closeQuiz} className="text-xs text-brand-400 hover:text-brand-600 flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> {isEn ? "Exit" : "Salir"}
          </button>
          <p className="text-xs font-bold text-brand-400">{currentQ + 1}/{totalQ}</p>
        </div>
        <div className="h-1.5 rounded-full bg-brand-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-leaf-500 transition-all duration-300"
            style={{ width: `${((currentQ + 1) / totalQ) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="rounded-2xl border border-brand-200/70 bg-white p-5">
          <p className="text-base font-bold text-brand-900 leading-relaxed">
            {isEn ? q.questionEn : q.question}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {(isEn ? q.optionsEn : q.options).map((opt, i) => {
            let style = QUIZ_ANSWER_COLORS.default
            if (selectedAnswer !== null) {
              if (i === q.correctIndex) {
                style = QUIZ_ANSWER_COLORS.correct
              } else if (i === selectedAnswer && !isCorrect) {
                style = QUIZ_ANSWER_COLORS.incorrect
              } else {
                style = QUIZ_ANSWER_COLORS.disabled
              }
            }

            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={selectedAnswer !== null}
                className={`w-full text-left rounded-xl border-2 p-4 text-sm font-medium transition-all active:scale-[0.98] ${style}`}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-500 mr-3">
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            )
          })}
        </div>

        {/* Explanation — feedback after every answer (PDF requirement) */}
        {showExplanation && (
          <div className={`rounded-2xl p-4 ${isCorrect ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${isCorrect ? "text-green-600" : "text-amber-600"}`}>
              {isCorrect ? (isEn ? "Correct!" : "¡Correcto!") : (isEn ? "Not quite..." : "No del todo...")}
            </p>
            <p className={`text-sm leading-relaxed ${isCorrect ? "text-green-800" : "text-amber-800"}`}>
              {isEn ? q.explanationEn : q.explanation}
            </p>
          </div>
        )}

        {/* Next button */}
        {selectedAnswer !== null && (
          <button
            onClick={nextQuestion}
            className="w-full rounded-xl bg-brand-900 py-3.5 text-sm font-bold text-white hover:bg-brand-800 transition-colors active:scale-[0.98]"
          >
            {currentQ < totalQ - 1
              ? (isEn ? "Next question" : "Siguiente pregunta")
              : (isEn ? "See results" : "Ver resultados")
            }
          </button>
        )}
      </div>
    )
  }

  // ── Module listing ──
  const totalPoints = allQuizzes.length > 0
    ? allQuizzes.reduce((sum, q) => sum + q.points, 0)
    : getTotalQuizPoints()
  const earnedPoints = modules.flatMap(m => m.quizzes)
    .filter(q => completedIds.includes(q.id))
    .reduce((sum, q) => sum + q.points, 0)

  return (
    <div className="space-y-5 animate-fade-up pb-8">
      {/* Header */}
      <div>
        <Link href="/profile" className="text-xs text-brand-400 hover:text-brand-600 inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("earn.back")}
        </Link>
        <h1 className="text-xl font-bold text-brand-900 mt-1">{t("earn.title")}</h1>
        <p className="text-sm text-brand-400 mt-0.5">{t("earn.subtitle")}</p>
      </div>

      {/* Total progress */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-900 to-brand-800 p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-brand-300">{t("earn.progress")}</p>
            <p className="text-2xl font-bold mt-1">{earnedPoints} <span className="text-base font-normal text-brand-400 flex items-center gap-1">/ {totalPoints} <Coffee className="h-4 w-4 inline" /></span></p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <BookOpen className="h-7 w-7 text-white/80" />
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-leaf-400 transition-all"
            style={{ width: `${totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Modules */}
      {modules.map(mod => {
        const completedInModule = mod.quizzes.filter(q => completedIds.includes(q.id)).length
        const totalInModule = mod.quizzes.length

        return (
          <div key={mod.id}>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-5 w-5 text-brand-500" />
              <div className="flex-1">
                <p className="text-sm font-bold text-brand-900">{isEn ? mod.titleEn : mod.title}</p>
                <p className="text-[10px] text-brand-400">{isEn ? mod.descriptionEn : mod.description}</p>
              </div>
              <p className="text-xs text-brand-400">{completedInModule}/{totalInModule}</p>
            </div>

            <div className="space-y-2">
              {mod.quizzes.map(quiz => {
                const done = completedIds.includes(quiz.id)
                const cadence = quiz.cadence
                return (
                  <button
                    key={quiz.id}
                    onClick={() => startQuiz(quiz.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-all active:scale-[0.98] ${
                      done
                        ? "border-green-200 bg-green-50/50"
                        : "border-brand-200/70 bg-white hover:border-brand-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-brand-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-bold ${done ? "text-green-800" : "text-brand-900"}`}>
                            {isEn ? quiz.titleEn : quiz.title}
                          </p>
                        </div>
                        <p className="text-xs text-brand-400 mt-0.5">
                          {isEn ? quiz.descriptionEn : quiz.description}
                        </p>
                        {/* Cadence badge */}
                        <span className={`inline-block mt-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cadenceColors[cadence]}`}>
                          {isEn ? cadenceLabels[cadence].en : cadenceLabels[cadence].es}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        {done ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 gap-1">
                            <Check className="h-3 w-3" /> {isEn ? "Done" : "Hecho"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-leaf-100 px-2 py-0.5 text-[10px] font-bold text-leaf-700 gap-1">
                            +{quiz.points} <Coffee className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
