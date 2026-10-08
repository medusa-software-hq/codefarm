package software.medusa.codefarm.origin.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.LoggerContext
import ch.qos.logback.classic.spi.LoggingEvent
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CloudLoggingEncoderTest {
  private val logger = LoggerContext().getLogger("software.medusa.codefarm.Example")

  private fun event(
      level: Level = Level.INFO,
      throwable: Throwable? = null,
      logContext: Map<String, String> = emptyMap(),
  ) =
      LoggingEvent("fqcn", logger, level, "Did {}", throwable, arrayOf("something")).apply {
        instant = Instant.parse("2026-10-08T12:00:00.123Z")
        mdcPropertyMap = logContext
      }

  private fun encode(event: LoggingEvent, projectId: String = "project") =
      CloudLoggingEncoder().apply { this.projectId = projectId }.encode(event).decodeToString()

  @Test
  fun `writes an event as a line of JSON, its trace by full name and the rest of the context as labels`() {
    val line =
        encode(
            event(
                logContext =
                    mapOf(
                        traceIdKey to "0af7651916cd43dd8448eb211c80319c",
                        callerEmailKey to "a@b.c",
                    ),
            ),
        )

    assertEquals(
        """{"time":"2026-10-08T12:00:00.123Z","severity":"INFO","message":"Did something",""" +
            """"logger":"software.medusa.codefarm.Example",""" +
            """"logging.googleapis.com/trace":"projects/project/traces/0af7651916cd43dd8448eb211c80319c",""" +
            """"logging.googleapis.com/labels":{"callerEmail":"a@b.c"}}""" +
            "\n",
        line,
    )
  }

  @Test
  fun `names Cloud Logging's severities`() {
    val severities =
        listOf(Level.ERROR, Level.WARN, Level.INFO, Level.DEBUG, Level.TRACE).map {
          Regex(""""severity":"(\w+)"""").find(encode(event(level = it)))?.groupValues?.get(1)
        }

    assertEquals(listOf("ERROR", "WARNING", "INFO", "DEBUG", "DEBUG"), severities)
  }

  @Test
  fun `writes the stack trace where Error Reporting looks for it`() {
    val line = encode(event(level = Level.ERROR, throwable = IllegalStateException("Broken")))

    assertTrue(line.contains(""""stack_trace":"java.lang.IllegalStateException: Broken\n\tat """))
  }

  @Test
  fun `leaves the trace out without a project`() {
    val line =
        encode(event(logContext = mapOf(traceIdKey to "0af7651916cd43dd8448eb211c80319c")), "")

    assertEquals(false, line.contains("trace"))
  }
}
